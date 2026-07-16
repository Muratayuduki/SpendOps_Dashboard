import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SRC_DIR = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC_DIR))

import handler  # noqa: E402


def valid_summary(month="2026-06", source_type="PAYPAY", total=3000):
    return {
        "month": month,
        "source_type": source_type,
        "total_expense": total,
        "transaction_count": 2,
        "categories": {"食費": total},
        "payment_methods": {"PayPay" if source_type == "PAYPAY" else "JCB": {"amount": total, "count": 2}},
        "partial": False,
    }


def auth_event(route_key, body=None, month=None, source=None, groups=None):
    claims = {"sub": "user-current"}
    if groups is not None:
        claims["cognito:groups"] = groups
    event = {
        "requestContext": {"routeKey": route_key, "authorizer": {"jwt": {"claims": claims}}},
    }
    if body is not None:
        event["body"] = json.dumps(body, ensure_ascii=False)
    if month is not None:
        event["pathParameters"] = {"month": month}
    if source is not None:
        event["queryStringParameters"] = {"source": source}
    return event


class FakeBatchWriter:
    def __init__(self, table):
        self.table = table

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def put_item(self, Item):
        self.table.put_item(Item=Item)


class FakeTable:
    def __init__(self, items=None):
        self.items = list(items or [])

    def batch_writer(self, **_kwargs):
        return FakeBatchWriter(self)

    def put_item(self, Item):
        keys = (Item.get("user_id"), Item.get("month") or Item.get("import_batch_id"))
        self.items = [
            existing
            for existing in self.items
            if (existing.get("user_id"), existing.get("month") or existing.get("import_batch_id")) != keys
        ]
        self.items.append(Item)
        return {}

    def query(self, **_kwargs):
        return {"Items": list(self.items)}

    def get_item(self, Key):
        item = next(
            (
                value
                for value in self.items
                if value.get("user_id") == Key["user_id"] and value.get("month") == Key["month"]
            ),
            None,
        )
        return {"Item": item} if item else {}

    def scan(self, **kwargs):
        if kwargs.get("Select") == "COUNT":
            return {"Count": len(self.items)}
        values = kwargs.get("ExpressionAttributeValues", {})
        report_month = values.get(":report_month")
        source_type = values.get(":source_type")
        user_id = values.get(":user_id")
        partial = values.get(":partial")
        selected = [
            item
            for item in self.items
            if item.get("report_month") == report_month
            and (source_type is None or item.get("source_type") == source_type)
            and item.get("user_id") != user_id
            and item.get("partial", False) == partial
        ]
        return {"Items": selected}


class HandlerTests(unittest.TestCase):
    def setUp(self):
        self.summaries = FakeTable()
        self.batches = FakeTable()
        self.table_patch = patch.object(
            handler,
            "_table",
            side_effect=lambda name: self.summaries if name == "USER_MONTHLY_SUMMARIES_TABLE" else self.batches,
        )
        self.table_patch.start()

    def tearDown(self):
        self.table_patch.stop()

    def test_demo_report_total_is_calculated(self):
        report = handler.build_report(handler.DEMO_TRANSACTIONS, handler.DEMO_MONTH)
        self.assertEqual(report["summary"]["total_expense"], 184_620)
        self.assertEqual(report["summary"]["transaction_count"], 12)

    def test_health_route_reports_db_ready(self):
        response = handler.lambda_handler({"requestContext": {"routeKey": "GET /health"}}, None)
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["dataset"], "db-ready")

    def test_import_requires_jwt_subject_without_echoing_body(self):
        response = handler.lambda_handler(
            {"requestContext": {"routeKey": "POST /imports"}, "body": "sensitive csv contents"},
            None,
        )
        self.assertEqual(response["statusCode"], 401)
        self.assertNotIn("sensitive csv contents", response["body"])

    def test_summary_validation_rejects_mismatched_totals(self):
        summary = valid_summary()
        summary["categories"] = {"食費": 1}
        with self.assertRaises(ValueError):
            handler.validate_summary(summary)

    def test_summary_validation_rejects_free_text_categories(self):
        summary = valid_summary()
        summary["categories"] = {"個別の店舗名": 3000}
        with self.assertRaises(ValueError):
            handler.validate_summary(summary)

    def test_import_saves_only_monthly_aggregate_and_batch_metadata(self):
        payload = {
            "summaries": [{**valid_summary(), "merchant": "must-not-be-saved"}],
            "validation": {"accepted_count": 2, "ignored_count": 1, "invalid_count": 0},
        }
        response = handler.lambda_handler(auth_event("POST /imports", payload), None)
        body = json.loads(response["body"])

        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(body["saved_summary_count"], 1)
        stored = self.summaries.items[0]
        self.assertEqual(stored["user_id"], "user-current")
        self.assertNotIn("merchant", stored)
        self.assertNotIn("email", stored)
        self.assertNotIn("csv", json.dumps(stored, ensure_ascii=False).lower())
        self.assertEqual(self.batches.items[0]["consent_version"], "2026-07-15")

    def test_import_replaces_same_user_month_and_source(self):
        payload = {"summaries": [valid_summary(total=3000)]}
        handler.save_analysis("user-current", payload)
        handler.save_analysis("user-current", {"summaries": [valid_summary(total=4000)]})
        self.assertEqual(len(self.summaries.items), 1)
        self.assertEqual(self.summaries.items[0]["total_expense"], 4000)

    def test_group_comparison_hides_average_below_five_other_users(self):
        self.summaries.items = [
            {
                "user_id": f"other-{index}",
                "report_month": "2026-06",
                "source_type": "PAYPAY",
                "total_expense": 1000,
                "categories": {"食費": 1000},
            }
            for index in range(4)
        ]
        comparison = handler.build_group_comparison("2026-06", "PAYPAY", "user-current")
        self.assertFalse(comparison["eligible"])
        self.assertIsNone(comparison["average_total"])
        self.assertEqual(comparison["category_averages"], {})

    def test_group_comparison_uses_five_other_users_and_excludes_current(self):
        self.summaries.items = [
            {
                "user_id": f"other-{index}",
                "report_month": "2026-06",
                "source_type": "PAYPAY",
                "total_expense": (index + 1) * 1000,
                "categories": {"食費": (index + 1) * 1000},
            }
            for index in range(5)
        ] + [
            {
                "user_id": "user-current",
                "report_month": "2026-06",
                "source_type": "PAYPAY",
                "total_expense": 999_999,
                "categories": {"食費": 999_999},
            }
        ]
        comparison = handler.build_group_comparison("2026-06", "PAYPAY", "user-current")
        self.assertTrue(comparison["eligible"])
        self.assertEqual(comparison["participant_count"], 5)
        self.assertEqual(comparison["average_total"], 3000)
        self.assertEqual(comparison["category_averages"]["食費"], 3000)

    def test_group_comparison_excludes_partial_months(self):
        self.summaries.items = [
            {
                "user_id": f"other-{index}",
                "report_month": "2026-06",
                "source_type": "PAYPAY",
                "total_expense": 1000,
                "categories": {"食費": 1000},
                "partial": index == 4,
            }
            for index in range(5)
        ]
        comparison = handler.build_group_comparison("2026-06", "PAYPAY", "user-current")
        self.assertFalse(comparison["eligible"])
        self.assertEqual(comparison["participant_count"], 4)

    def test_saved_report_route_returns_own_summary_and_anonymous_comparison(self):
        handler.save_analysis("user-current", {"summaries": [valid_summary()]})
        response = handler.lambda_handler(
            auth_event("GET /reports/{month}", month="2026-06", source="PAYPAY"), None
        )
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["report"]["total_expense"], 3000)
        self.assertEqual(body["comparison"]["participant_count"], 0)
        self.assertNotIn("user_id", response["body"])

    def test_all_report_combines_paypay_and_card_for_current_user(self):
        handler.save_analysis(
            "user-current",
            {
                "summaries": [
                    valid_summary(source_type="PAYPAY", total=3000),
                    valid_summary(source_type="CARD", total=7000),
                ]
            },
        )
        response = handler.lambda_handler(
            auth_event("GET /reports/{month}", month="2026-06", source="ALL"), None
        )
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["report"]["source_type"], "ALL")
        self.assertEqual(body["report"]["total_expense"], 10_000)
        self.assertEqual(body["report"]["transaction_count"], 4)
        self.assertEqual(body["report"]["payment_methods"]["PayPay"]["amount"], 3000)
        self.assertEqual(body["report"]["payment_methods"]["JCB"]["amount"], 7000)

    def test_all_report_is_partial_when_current_user_has_only_one_source(self):
        handler.save_analysis("user-current", {"summaries": [valid_summary()]})
        report = handler.get_saved_report("user-current", "2026-06", "ALL")
        self.assertIsNotNone(report)
        self.assertTrue(report["report"]["partial"])

    def test_all_comparison_requires_both_sources_from_five_other_users(self):
        self.summaries.items = [
            {
                "user_id": f"other-{index}",
                "report_month": "2026-06",
                "source_type": source_type,
                "total_expense": 1000 if source_type == "PAYPAY" else 2000,
                "categories": {"食費": 1000 if source_type == "PAYPAY" else 2000},
                "partial": False,
            }
            for index in range(5)
            for source_type in ("PAYPAY", "CARD")
        ] + [
            {
                "user_id": "paypay-only",
                "report_month": "2026-06",
                "source_type": "PAYPAY",
                "total_expense": 99_999,
                "categories": {"食費": 99_999},
                "partial": False,
            }
        ]
        comparison = handler.build_group_comparison("2026-06", "ALL", "user-current")
        self.assertTrue(comparison["eligible"])
        self.assertEqual(comparison["participant_count"], 5)
        self.assertEqual(comparison["average_total"], 3000)
        self.assertEqual(comparison["category_averages"]["食費"], 3000)

    def test_report_list_returns_only_current_user_items(self):
        handler.save_analysis("user-current", {"summaries": [valid_summary()]})
        response = handler.lambda_handler(auth_event("GET /reports"), None)
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(len(body["reports"]), 1)
        self.assertNotIn("user_id", response["body"])

    def test_admin_route_requires_admin_group(self):
        denied = handler.lambda_handler(auth_event("GET /admin/imports", groups="users"), None)
        allowed = handler.lambda_handler(auth_event("GET /admin/imports", groups="[admins]"), None)
        self.assertEqual(denied["statusCode"], 403)
        self.assertEqual(allowed["statusCode"], 200)


if __name__ == "__main__":
    unittest.main()
