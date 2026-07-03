# Codex 作業引き継ぎ

このファイルは、Codex が次回以降の作業開始時に確認するための運用メモです。
README にはプロジェクト概要と仕様を置き、Codex 向けの進め方、更新履歴、次回作業、未決事項はこのファイルで管理します。

## 作業開始時の必須手順

1. `README.md` でプロジェクト概要、最新仕様、完了条件を確認する
2. `docs/system_prompt_guardrails_v2.md` でガードレール、禁止事項、出力方針を確認する
3. この `docs/codex_handoff.md` で進捗、Notion更新履歴、未決事項、次回作業を確認する
4. 既存資料、既存コード、既存draw.ioを確認してから変更する
5. 不明点が成果物の品質に大きく影響する場合は、推測せず質問する
6. 個人情報、金融情報、メール本文全文、カード番号、ログイン情報、認証コードを保存・出力しない
7. 破壊的変更、外部公開、削除、本番デプロイ、秘密情報の変更は事前確認する

## 最新仕様の要点

- PayPayはGmail自動取得の対象外
- PayPayはCSVアップロード時に反映する
- JCBカードと横浜銀行はGmail + GASで自動取得する
- 横浜銀行は支出ではなく入出金履歴として別枠で扱う
- 月別レポート画面を最優先にする
- PayPay最終取込日と未取込警告を表示する
- Terraformは提出後の追加開発扱いにする

## Notion更新履歴

2026-07-03に、Notionの「SpendOps Dashboard 開発計画」を更新済みです。

親ページ:

- SpendOps Dashboard 開発計画
- URL: https://app.notion.com/p/391e666f35db81fa9c1aef83769c6f3a

更新済みページ:

| ページ | URL | 内容 |
|---|---|---|
| 04 課題・次アクション | https://app.notion.com/p/391e666f35db81598841f835feea473e | PayPay CSV化、全自動性低下への改善案、次アクションを更新 |
| 05 企画書 | https://app.notion.com/p/392e666f35db81449c61edf814034178 | 新規作成。企画概要、背景、課題、提供価値、成功条件を記載 |
| 06 要件定義 | https://app.notion.com/p/392e666f35db81e28aadfb321c385d9d | 新規作成。機能要件、非機能要件、データ項目、API、画面要件を記載 |

親ページの目次も `01` から `06` の順に並ぶよう修正済みです。

## ローカル資料の状態

| パス | 内容 | 注意 |
|---|---|---|
| `notion/spendops_dashboard_notion_plan_with_gantt.md` | 旧Notion計画資料 | PayPayもGmail取得する古い記述が残っている可能性あり |
| `drowio/spendops_aws_architecture.drawio` | AWS構成図 | 現時点ではPayPay -> Gmailの線が残っているため、次回修正対象 |
| `docs/system_prompt_guardrails_v2.md` | system prompt・ガードレール | 最新仕様へ更新済み。作業前にREADMEと併読する |
| `README.md` | プロジェクト概要と最新仕様 | Codex向け運用メモはこのファイルへ分離 |
| `AGENTS.md` | Codexのリポジトリ作業ルール | 作業開始時に読むファイルを定義 |

## 次回以降の優先作業

1. `drowio/spendops_aws_architecture.drawio` を最新仕様に合わせて修正する
   - PayPay -> Gmail の線を削除
   - PayPay -> CSV -> Browser Upload -> API Gateway -> Lambda CSV Import の流れにする
   - Bank / JCB -> Gmail -> GAS の流れは残す
2. `notion/spendops_dashboard_notion_plan_with_gantt.md` の古い記述を最新仕様に合わせて更新する
   - PayPayメール解析の記述をPayPay CSV取込に変更
   - スケジュール上の「PayPay通知メール解析」を「PayPay CSV取込機能」に変更
3. 実装に入る場合は、まずNext.js / Lambda / GASのディレクトリ構成を決める
4. 月別レポート画面を最優先で実装する

## 未決事項

- PayPay CSVの実際のカラム名
- PayPay CSVの文字コード
- PayPay CSVに取引IDが含まれるか
- PayPay CSVで返金・取消がどのように表現されるか
- 横浜銀行メールで支払先または摘要がどこまで取得できるか
- JCBの速報通知と取消通知の具体的な本文形式
- AWS Cost Explorer APIを初期版に含めるか、提出後に回すか
