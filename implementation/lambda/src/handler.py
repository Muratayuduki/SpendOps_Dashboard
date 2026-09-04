"""SpendOps Dashboard API.

原本CSV、ファイル名、カード番号、口座番号、認証情報は受け取らない。
ブラウザで正規化した個別取引と月別集計だけを保存し、リクエスト本文や取引内容はログへ出力しない。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key


DEMO_MONTH = "2026-06"
DEMO_GROUP_AVERAGE = 197_400
DEMO_PREVIOUS_TOTAL = 197_500
MINIMUM_GROUP_PARTICIPANTS = 5
MAX_SUMMARIES_PER_IMPORT = 60
MAX_TRANSACTIONS_PER_IMPORT = 5_000
MAX_TRANSACTIONS_PER_RESPONSE = 5_000
MAX_CATEGORY_RULES_PER_REQUEST = 500
MAX_CATEGORY_RULES_PER_RESPONSE = 2_000
ALLOWED_SOURCE_TYPES = {"PAYPAY", "CARD"}
ALLOWED_REPORT_SOURCES = {"PAYPAY", "CARD", "ALL"}
ALLOWED_TRANSACTION_SOURCES = {"PAYPAY", "JCB", "VISA", "CARD"}
ALLOWED_CATEGORIES = {"食費", "日用品", "交通費", "娯楽", "光熱費", "通信費", "医療費", "衣服費", "住居費", "ネットでの購入", "その他"}
ALLOWED_PAYMENT_METHODS = {"PayPay", "JCB", "VISA", "カード"}
MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
DATE_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
SENSITIVE_NUMBER_PATTERN = re.compile(r"(?<!\d)\d{7,19}(?!\d)")
CATEGORY_RULE_KEY_PATTERN = re.compile(r"^(PAYPAY|JCB|VISA|CARD)#[0-9a-f]{64}$")

DEMO_GROUP_CATEGORY_AVERAGES = {
    "食費": 84_200,
    "日用品": 41_700,
    "交通費": 29_600,
    "娯楽": 41_900,
}

# 学校課題の動作確認用に作成した合成データ。実在する利用者の明細ではない。
DEMO_TRANSACTIONS = [
    {"date": "2026-06-02", "amount": 18_240, "category": "食費", "source": "PayPay"},
    {"date": "2026-06-05", "amount": 12_310, "category": "日用品", "source": "JCB"},
    {"date": "2026-06-07", "amount": 9_800, "category": "交通費", "source": "VISA"},
    {"date": "2026-06-09", "amount": 25_780, "category": "食費", "source": "JCB"},
    {"date": "2026-06-11", "amount": 6_540, "category": "娯楽", "source": "PayPay"},
    {"date": "2026-06-14", "amount": 14_500, "category": "日用品", "source": "VISA"},
    {"date": "2026-06-17", "amount": 11_200, "category": "交通費", "source": "PayPay"},
    {"date": "2026-06-19", "amount": 33_520, "category": "食費", "source": "VISA"},
    {"date": "2026-06-22", "amount": 9_600, "category": "娯楽", "source": "JCB"},
    {"date": "2026-06-24", "amount": 17_500, "category": "日用品", "source": "PayPay"},
    {"date": "2026-06-27", "amount": 12_230, "category": "交通費", "source": "JCB"},
    {"date": "2026-06-29", "amount": 13_400, "category": "娯楽", "source": "VISA"},
]

_DYNAMODB = None


def _round_rate(value: float) -> float:
    return round(value, 1)


def build_report(transactions: list[dict[str, Any]], month: str) -> dict[str, Any]:
    """合成取引から公開デモ用の月次集計を作る。"""

    month_transactions = [item for item in transactions if item["date"].startswith(month)]
    total_expense = sum(int(item["amount"]) for item in month_transactions)
    category_totals: dict[str, int] = defaultdict(int)
    source_totals: dict[str, int] = defaultdict(int)
    source_counts: dict[str, int] = defaultdict(int)

    for item in month_transactions:
        category_totals[item["category"]] += int(item["amount"])
        source_totals[item["source"]] += int(item["amount"])
        source_counts[item["source"]] += 1

    categories = []
    for name, amount in sorted(category_totals.items(), key=lambda item: item[1], reverse=True):
        group_average = DEMO_GROUP_CATEGORY_AVERAGES.get(name, 0)
        categories.append(
            {
                "name": name,
                "amount": amount,
                "ratio": _round_rate((amount / total_expense) * 100) if total_expense else 0,
                "group_average": group_average,
                "difference": amount - group_average,
            }
        )

    sources = [
        {"name": name, "amount": source_totals[name], "count": count}
        for name, count in sorted(source_counts.items())
    ]
    difference = total_expense - DEMO_GROUP_AVERAGE
    difference_rate = _round_rate((difference / DEMO_GROUP_AVERAGE) * 100)
    month_over_month = _round_rate(
        ((total_expense - DEMO_PREVIOUS_TOTAL) / DEMO_PREVIOUS_TOTAL) * 100
    )

    return {
        "dataset": "synthetic",
        "month": month,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_expense": total_expense,
            "group_average": DEMO_GROUP_AVERAGE,
            "difference": difference,
            "difference_rate": difference_rate,
            "transaction_count": len(month_transactions),
            "daily_average": round(total_expense / 30) if total_expense else 0,
            "previous_total": DEMO_PREVIOUS_TOTAL,
            "month_over_month": month_over_month,
        },
        "categories": categories,
        "sources": sources,
        "insight": "合成データによる比較デモです。",
        "privacy": "合成データを使用。CSV原本・氏名・カード番号は保存していません。",
    }


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"Unsupported type: {type(value).__name__}")


def _response(status_code: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        "body": json.dumps(body, ensure_ascii=False, default=_json_default),
    }


def _table(environment_name: str):
    global _DYNAMODB
    if _DYNAMODB is None:
        _DYNAMODB = boto3.resource("dynamodb")
    table_name = os.environ.get(environment_name, "")
    if not table_name:
        raise RuntimeError(f"{environment_name} is not configured")
    return _DYNAMODB.Table(table_name)


def _claims(event: dict[str, Any]) -> dict[str, Any]:
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )


def _user_id(event: dict[str, Any]) -> str | None:
    value = _claims(event).get("sub")
    return str(value) if value else None


def _is_admin(event: dict[str, Any]) -> bool:
    groups = _claims(event).get("cognito:groups", [])
    if isinstance(groups, str):
        groups = [item.strip() for item in groups.strip("[]").split(",") if item.strip()]
    return "admins" in groups


def _parse_body(event: dict[str, Any]) -> dict[str, Any] | None:
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, json.JSONDecodeError):
        return None
    return body if isinstance(body, dict) else None


def _validated_nonnegative_int(value: Any, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("数値形式が不正です。")
    numeric = int(value)
    if numeric != value or numeric < 0 or numeric > maximum:
        raise ValueError("数値が許容範囲外です。")
    return numeric


def _validated_amount_map(
    value: Any,
    maximum_items: int = 20,
    allowed_names: set[str] | None = None,
) -> dict[str, int]:
    if not isinstance(value, dict) or len(value) > maximum_items:
        raise ValueError("集計項目の形式が不正です。")
    normalized: dict[str, int] = {}
    for raw_name, raw_amount in value.items():
        name = str(raw_name).strip()
        if not name or len(name) > 40 or (allowed_names is not None and name not in allowed_names):
            raise ValueError("集計項目名が不正です。")
        normalized[name] = _validated_nonnegative_int(raw_amount, 1_000_000_000)
    return normalized


def _validated_payment_methods(value: Any) -> dict[str, dict[str, int]]:
    if not isinstance(value, dict) or len(value) > 10:
        raise ValueError("支払い方法集計の形式が不正です。")
    normalized: dict[str, dict[str, int]] = {}
    for raw_name, raw_summary in value.items():
        name = str(raw_name).strip()
        if (
            not name
            or len(name) > 30
            or name not in ALLOWED_PAYMENT_METHODS
            or not isinstance(raw_summary, dict)
        ):
            raise ValueError("支払い方法集計が不正です。")
        normalized[name] = {
            "amount": _validated_nonnegative_int(raw_summary.get("amount"), 1_000_000_000),
            "count": _validated_nonnegative_int(raw_summary.get("count"), 100_000),
        }
    return normalized


def validate_summary(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("月別集計の形式が不正です。")
    month = str(value.get("month", ""))
    source_type = str(value.get("source_type", "")).upper()
    if not MONTH_PATTERN.fullmatch(month) or source_type not in ALLOWED_SOURCE_TYPES:
        raise ValueError("対象月または支払い種別が不正です。")

    total_expense = _validated_nonnegative_int(value.get("total_expense"), 1_000_000_000)
    transaction_count = _validated_nonnegative_int(value.get("transaction_count"), 100_000)
    categories = _validated_amount_map(value.get("categories"), allowed_names=ALLOWED_CATEGORIES)
    payment_methods = _validated_payment_methods(value.get("payment_methods"))
    if sum(categories.values()) != total_expense:
        raise ValueError("カテゴリ合計と月間支出が一致しません。")
    if sum(item["amount"] for item in payment_methods.values()) != total_expense:
        raise ValueError("支払い方法合計と月間支出が一致しません。")

    return {
        "month": month,
        "source_type": source_type,
        "total_expense": total_expense,
        "transaction_count": transaction_count,
        "categories": categories,
        "payment_methods": payment_methods,
        "partial": bool(value.get("partial", False)),
    }


def _validated_text(value: Any, maximum_length: int) -> str:
    if not isinstance(value, str):
        raise ValueError("取引文字列の形式が不正です。")
    normalized = " ".join(value.split()).strip()
    if not normalized or len(normalized) > maximum_length:
        raise ValueError("取引文字列の長さが不正です。")
    return normalized


def _validated_merchant(value: Any) -> str:
    normalized = _validated_text(value, 160)
    return SENSITIVE_NUMBER_PATTERN.sub("[redacted]", normalized)


def _transaction_source(value: Any) -> str:
    normalized = str(value or "").strip().upper()
    if normalized not in ALLOWED_TRANSACTION_SOURCES:
        raise ValueError("支払い元が不正です。")
    return normalized


def _summary_scope_for_transaction(source: str) -> str:
    return "PAYPAY" if source == "PAYPAY" else "CARD"


def validate_transaction(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("個別取引の形式が不正です。")
    transaction_date = str(value.get("date", ""))
    if not DATE_PATTERN.fullmatch(transaction_date):
        raise ValueError("取引日が不正です。")
    try:
        datetime.strptime(transaction_date, "%Y-%m-%d")
    except ValueError as error:
        raise ValueError("取引日が不正です。") from error
    category = _validated_text(value.get("category"), 40)
    if category not in ALLOWED_CATEGORIES:
        raise ValueError("カテゴリが不正です。")
    return {
        "date": transaction_date,
        "amount": _validated_nonnegative_int(value.get("amount"), 1_000_000_000),
        "merchant": _validated_merchant(value.get("merchant")),
        "category": category,
        "source": _transaction_source(value.get("source")),
        "occurrence": _validated_nonnegative_int(value.get("occurrence", 0), 10_000),
    }


def _validate_transaction_summaries(
    summaries: list[dict[str, Any]], transactions: list[dict[str, Any]]
) -> None:
    actual: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"total_expense": 0, "transaction_count": 0}
    )
    for transaction in transactions:
        key = (transaction["date"][:7], _summary_scope_for_transaction(transaction["source"]))
        actual[key]["total_expense"] += transaction["amount"]
        actual[key]["transaction_count"] += 1

    expected = {
        (summary["month"], summary["source_type"]): {
            "total_expense": summary["total_expense"],
            "transaction_count": summary["transaction_count"],
        }
        for summary in summaries
    }
    if actual != expected:
        raise ValueError("個別取引と月別集計が一致しません。")


def _transaction_key(transaction: dict[str, Any]) -> str:
    fingerprint = json.dumps(
        [
            transaction["date"],
            transaction["amount"],
            transaction["merchant"],
            transaction["source"],
            transaction["occurrence"],
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:32]
    return f"{transaction['date']}#{transaction['source']}#{digest}"


def save_analysis(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    raw_summaries = payload.get("summaries")
    if not isinstance(raw_summaries, list) or not 1 <= len(raw_summaries) <= MAX_SUMMARIES_PER_IMPORT:
        raise ValueError("保存する月別集計の件数が不正です。")
    summaries = [validate_summary(item) for item in raw_summaries]
    if len({(item["month"], item["source_type"]) for item in summaries}) != len(summaries):
        raise ValueError("同じ月と支払い種別が重複しています。")

    raw_transactions = payload.get("transactions")
    if (
        not isinstance(raw_transactions, list)
        or not 1 <= len(raw_transactions) <= MAX_TRANSACTIONS_PER_IMPORT
    ):
        raise ValueError("保存する個別取引の件数が不正です。")
    transactions = [validate_transaction(item) for item in raw_transactions]
    _validate_transaction_summaries(summaries, transactions)

    transactions_table = _table("TRANSACTIONS_TABLE")
    summaries_table = _table("USER_MONTHLY_SUMMARIES_TABLE")
    batches_table = _table("IMPORT_BATCHES_TABLE")
    imported_at = datetime.now(timezone.utc).isoformat()
    batch_id = str(uuid.uuid4())

    with transactions_table.batch_writer(
        overwrite_by_pkeys=["user_id", "transaction_key"]
    ) as batch:
        for transaction in transactions:
            batch.put_item(
                Item={
                    "user_id": user_id,
                    "transaction_key": _transaction_key(transaction),
                    "transaction_date": transaction["date"],
                    "amount": transaction["amount"],
                    "merchant": transaction["merchant"],
                    "category": transaction["category"],
                    "source": transaction["source"],
                    "import_batch_id": batch_id,
                    "imported_at": imported_at,
                    "schema_version": 2,
                }
            )

    with summaries_table.batch_writer(overwrite_by_pkeys=["user_id", "month"]) as batch:
        for summary in summaries:
            batch.put_item(
                Item={
                    "user_id": user_id,
                    "month": f"{summary['month']}#{summary['source_type']}",
                    "report_month": summary["month"],
                    "source_type": summary["source_type"],
                    "total_expense": summary["total_expense"],
                    "transaction_count": summary["transaction_count"],
                    "categories": summary["categories"],
                    "payment_methods": summary["payment_methods"],
                    "partial": summary["partial"],
                    "updated_at": imported_at,
                    "schema_version": 1,
                }
            )

    validation = payload.get("validation") if isinstance(payload.get("validation"), dict) else {}
    batches_table.put_item(
        Item={
            "user_id": user_id,
            "import_batch_id": batch_id,
            "summary_count": len(summaries),
            "transaction_count": len(transactions),
            "source_types": sorted({item["source_type"] for item in summaries}),
            "report_months": sorted({item["month"] for item in summaries}),
            "accepted_count": _validated_nonnegative_int(validation.get("accepted_count", 0), 1_000_000),
            "ignored_count": _validated_nonnegative_int(validation.get("ignored_count", 0), 1_000_000),
            "invalid_count": _validated_nonnegative_int(validation.get("invalid_count", 0), 1_000_000),
            "consent_version": "2026-07-15",
            "imported_at": imported_at,
        }
    )
    return {
        "saved_transaction_count": len(transactions),
        "saved_summary_count": len(summaries),
        "import_batch_id": batch_id,
        "saved_at": imported_at,
    }


def _query_user_summaries(user_id: str) -> list[dict[str, Any]]:
    table = _table("USER_MONTHLY_SUMMARIES_TABLE")
    items: list[dict[str, Any]] = []
    request: dict[str, Any] = {"KeyConditionExpression": Key("user_id").eq(user_id)}
    while True:
        response = table.query(**request)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        request["ExclusiveStartKey"] = last_key
    return items


def _public_summary(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "month": item["report_month"],
        "source_type": item["source_type"],
        "total_expense": int(item.get("total_expense", 0)),
        "transaction_count": int(item.get("transaction_count", 0)),
        "categories": {name: int(amount) for name, amount in item.get("categories", {}).items()},
        "payment_methods": {
            name: {"amount": int(value.get("amount", 0)), "count": int(value.get("count", 0))}
            for name, value in item.get("payment_methods", {}).items()
        },
        "partial": bool(item.get("partial", False)),
        "updated_at": item.get("updated_at"),
    }


def list_saved_reports(user_id: str) -> list[dict[str, Any]]:
    return sorted(
        (_public_summary(item) for item in _query_user_summaries(user_id)),
        key=lambda item: (item["month"], item["source_type"]),
        reverse=True,
    )


def list_saved_transactions(user_id: str) -> dict[str, Any]:
    """本人に紐づく正規化済み明細だけを新しい順で返す。"""

    table = _table("TRANSACTIONS_TABLE")
    items: list[dict[str, Any]] = []
    request: dict[str, Any] = {
        "KeyConditionExpression": Key("user_id").eq(user_id),
        "ScanIndexForward": False,
        "Limit": MAX_TRANSACTIONS_PER_RESPONSE,
    }
    truncated = False
    while len(items) < MAX_TRANSACTIONS_PER_RESPONSE:
        request["Limit"] = MAX_TRANSACTIONS_PER_RESPONSE - len(items)
        response = table.query(**request)
        items.extend(
            item for item in response.get("Items", []) if str(item.get("user_id", "")) == user_id
        )
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        if len(items) >= MAX_TRANSACTIONS_PER_RESPONSE:
            truncated = True
            break
        request["ExclusiveStartKey"] = last_key

    transactions = [
        {
            "date": str(item.get("transaction_date", "")),
            "amount": int(item.get("amount", 0)),
            "merchant": str(item.get("merchant", "詳細なし")),
            "category": str(item.get("category", "その他")),
            "source": str(item.get("source", "CARD")),
        }
        for item in items[:MAX_TRANSACTIONS_PER_RESPONSE]
    ]
    transactions.sort(key=lambda item: item["date"], reverse=True)
    return {
        "transactions": transactions,
        "count": len(transactions),
        "truncated": truncated,
    }


def validate_category_rule(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError("分類ルールの形式が不正です。")
    rule_key = str(value.get("rule_key", "")).strip()
    source = _transaction_source(value.get("source"))
    category = _validated_text(value.get("category"), 40)
    if not CATEGORY_RULE_KEY_PATTERN.fullmatch(rule_key):
        raise ValueError("分類ルールの照合番号が不正です。")
    if not rule_key.startswith(f"{source}#") or category not in ALLOWED_CATEGORIES:
        raise ValueError("分類ルールの内容が不正です。")
    return {"rule_key": rule_key, "source": source, "category": category}


def save_category_rules(user_id: str, payload: dict[str, Any]) -> dict[str, int]:
    raw_rules = payload.get("rules")
    if not isinstance(raw_rules, list) or not 1 <= len(raw_rules) <= MAX_CATEGORY_RULES_PER_REQUEST:
        raise ValueError("保存する分類ルールの件数が不正です。")
    rules = [validate_category_rule(item) for item in raw_rules]
    if len({item["rule_key"] for item in rules}) != len(rules):
        raise ValueError("同じ分類ルールが重複しています。")

    table = _table("CATEGORY_RULES_TABLE")
    updated_at = datetime.now(timezone.utc).isoformat()
    with table.batch_writer(overwrite_by_pkeys=["user_id", "rule_key"]) as batch:
        for rule in rules:
            batch.put_item(
                Item={
                    "user_id": user_id,
                    "rule_key": rule["rule_key"],
                    "source": rule["source"],
                    "category": rule["category"],
                    "updated_at": updated_at,
                    "schema_version": 1,
                }
            )
    return {"saved_rule_count": len(rules)}


def list_category_rules(user_id: str) -> dict[str, Any]:
    table = _table("CATEGORY_RULES_TABLE")
    items: list[dict[str, Any]] = []
    request: dict[str, Any] = {
        "KeyConditionExpression": Key("user_id").eq(user_id),
        "Limit": MAX_CATEGORY_RULES_PER_RESPONSE,
    }
    truncated = False
    while len(items) < MAX_CATEGORY_RULES_PER_RESPONSE:
        request["Limit"] = MAX_CATEGORY_RULES_PER_RESPONSE - len(items)
        response = table.query(**request)
        items.extend(item for item in response.get("Items", []) if str(item.get("user_id", "")) == user_id)
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        if len(items) >= MAX_CATEGORY_RULES_PER_RESPONSE:
            truncated = True
            break
        request["ExclusiveStartKey"] = last_key

    rules = [
        {
            "rule_key": str(item.get("rule_key", "")),
            "source": str(item.get("source", "CARD")),
            "category": str(item.get("category", "その他")),
        }
        for item in items[:MAX_CATEGORY_RULES_PER_RESPONSE]
        if CATEGORY_RULE_KEY_PATTERN.fullmatch(str(item.get("rule_key", "")))
        and str(item.get("category", "")) in ALLOWED_CATEGORIES
    ]
    rules.sort(key=lambda item: item["rule_key"])
    return {"rules": rules, "count": len(rules), "truncated": truncated}


def build_group_comparison(month: str, source_type: str, excluded_user_id: str) -> dict[str, Any]:
    table = _table("USER_MONTHLY_SUMMARIES_TABLE")
    items: list[dict[str, Any]] = []
    filter_expression = "#report_month = :report_month AND #user_id <> :user_id AND #partial = :partial"
    request: dict[str, Any] = {
        "FilterExpression": filter_expression,
        "ExpressionAttributeNames": {
            "#report_month": "report_month",
            "#user_id": "user_id",
            "#partial": "partial",
        },
        "ExpressionAttributeValues": {
            ":report_month": month,
            ":user_id": excluded_user_id,
            ":partial": False,
        },
        "ProjectionExpression": "#user_id, #source_type, total_expense, categories",
    }
    request["ExpressionAttributeNames"]["#source_type"] = "source_type"
    while True:
        response = table.scan(**request)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        request["ExclusiveStartKey"] = last_key

    by_user: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        by_user[str(item["user_id"])].append(item)
    participant_items = list(by_user.values())

    participant_count = len(participant_items)
    base = {
        "eligible": participant_count >= MINIMUM_GROUP_PARTICIPANTS,
        "participant_count": participant_count,
        "minimum_participants": MINIMUM_GROUP_PARTICIPANTS,
        "month": month,
        "source_type": source_type,
    }
    if not base["eligible"]:
        return {**base, "average_total": None, "category_averages": {}}

    category_totals: dict[str, int] = defaultdict(int)
    participant_totals: list[int] = []
    for summaries in participant_items:
        participant_totals.append(sum(int(item.get("total_expense", 0)) for item in summaries))
        for item in summaries:
            for name, amount in item.get("categories", {}).items():
                category_totals[name] += int(amount)
    return {
        **base,
        "average_total": round(sum(participant_totals) / participant_count),
        "category_averages": {
            name: round(total / participant_count) for name, total in category_totals.items()
        },
}


def _combined_public_summary(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not items:
        return None
    public_items = [_public_summary(item) for item in items]
    categories: dict[str, int] = defaultdict(int)
    payment_methods: dict[str, dict[str, int]] = defaultdict(lambda: {"amount": 0, "count": 0})
    for item in public_items:
        for name, amount in item["categories"].items():
            categories[name] += int(amount)
        for name, value in item["payment_methods"].items():
            payment_methods[name]["amount"] += int(value["amount"])
            payment_methods[name]["count"] += int(value["count"])
    return {
        "month": public_items[0]["month"],
        "source_type": "ALL",
        "total_expense": sum(item["total_expense"] for item in public_items),
        "transaction_count": sum(item["transaction_count"] for item in public_items),
        "categories": dict(categories),
        "payment_methods": dict(payment_methods),
        "partial": (
            any(item["partial"] for item in public_items)
            or {item["source_type"] for item in public_items} != ALLOWED_SOURCE_TYPES
        ),
        "updated_at": max((item.get("updated_at") or "") for item in public_items) or None,
    }


def get_saved_report(user_id: str, month: str, source_type: str) -> dict[str, Any] | None:
    table = _table("USER_MONTHLY_SUMMARIES_TABLE")
    if source_type == "ALL":
        items = []
        for stored_source in sorted(ALLOWED_SOURCE_TYPES):
            response = table.get_item(Key={"user_id": user_id, "month": f"{month}#{stored_source}"})
            if response.get("Item"):
                items.append(response["Item"])
        report = _combined_public_summary(items)
    else:
        response = table.get_item(Key={"user_id": user_id, "month": f"{month}#{source_type}"})
        item = response.get("Item")
        report = _public_summary(item) if item else None
    if report is None:
        return None
    return {
        "report": report,
        "comparison": build_group_comparison(month, source_type, user_id),
    }


def _count_import_batches() -> int:
    table = _table("IMPORT_BATCHES_TABLE")
    total = 0
    request: dict[str, Any] = {"Select": "COUNT"}
    while True:
        response = table.scan(**request)
        total += int(response.get("Count", 0))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            return total
        request["ExclusiveStartKey"] = last_key


def lambda_handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    route_key = event.get("requestContext", {}).get("routeKey", "")

    if route_key == "GET /health":
        return _response(200, {"status": "ok", "service": "spendops-dashboard-api", "dataset": "db-ready"})
    if route_key == "GET /demo/report":
        return _response(200, build_report(DEMO_TRANSACTIONS, DEMO_MONTH))

    user_id = _user_id(event)
    if not user_id:
        return _response(401, {"message": "ログインが必要です。"})

    if route_key == "POST /imports":
        payload = _parse_body(event)
        if payload is None:
            return _response(400, {"message": "送信データの形式が不正です。"})
        try:
            result = save_analysis(user_id, payload)
        except ValueError as error:
            return _response(400, {"message": str(error)})
        return _response(201, {**result, "message": "月別分析を保存しました。"})

    if route_key == "GET /reports":
        return _response(200, {"reports": list_saved_reports(user_id)})

    if route_key == "GET /transactions":
        return _response(200, list_saved_transactions(user_id))

    if route_key == "GET /category-rules":
        return _response(200, list_category_rules(user_id))

    if route_key == "PUT /category-rules":
        payload = _parse_body(event)
        if payload is None:
            return _response(400, {"message": "送信データの形式が不正です。"})
        try:
            result = save_category_rules(user_id, payload)
        except ValueError as error:
            return _response(400, {"message": str(error)})
        return _response(200, {**result, "message": "本人用の分類ルールを保存しました。"})

    if route_key == "GET /reports/{month}":
        month = str(event.get("pathParameters", {}).get("month", ""))
        source_type = str(event.get("queryStringParameters", {}).get("source", "")).upper()
        if not MONTH_PATTERN.fullmatch(month) or source_type not in ALLOWED_REPORT_SOURCES:
            return _response(400, {"message": "対象月または支払い種別が不正です。"})
        report = get_saved_report(user_id, month, source_type)
        if report is None:
            return _response(404, {"message": "保存済み分析がありません。"})
        return _response(200, report)

    if route_key == "GET /admin/imports":
        if not _is_admin(event):
            return _response(403, {"message": "管理者権限が必要です。"})
        return _response(200, {"total_batches": _count_import_batches()})

    if route_key == "DELETE /users/me":
        return _response(501, {"message": "退会処理は誤操作防止のため未有効化です。"})

    return _response(404, {"message": "Route not found"})
