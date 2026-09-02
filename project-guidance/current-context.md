# SpendOps Dashboard 現在コンテキスト

更新日: 2026-09-02（Asia/Tokyo）

通常のリポジトリ作業では、このファイルと`project-guidance/active-guardrails.md`だけを最初に読む。詳細仕様、作業履歴、分野別手順は、依頼に必要な箇所だけ参照する。

## 正本と参照順

- 最新仕様と現在状態の正本: `README.md`
- 常時適用する安全規則: `project-guidance/active-guardrails.md`
- 現在の停止地点・次回作業: `project-guidance/current-handoff.md`
- 過去の詳細履歴: `project-guidance/history/`
- ガードレール設計の旧完全版: `project-guidance/archive/system_prompt_guardrails_v2.md`

README全体は、仕様変更、横断監査、資料同期など正本の詳細が必要な作業で読む。通常の局所修正・定型検証では、まずこのファイルを使い、必要な見出しだけ検索して読む。

## プロジェクト要約

- PayPay、JCB、三井住友VISAのCSVをブラウザで解析し、月別を中心に支出を分析するWebアプリ。
- 銀行CSVとAWS料金分析は対象外。
- CSV原本は保存せず、必要な正規化済み取引、月別集計、取込記録、分類ルールだけを扱う。
- 現行実装はCSV解析、支出レポート、比較、明細復元、分類学習まで対応済み。
- ソース別の最終取込日と未取込警告は未実装。

## 現在状態

- AWS基盤は2026-09-02に新しいAWSアカウントへTerraform第1段階を再構築済み。
- Terraform stateは48エントリ（管理リソース43件、data 5件）で、再Planは差分0。
- CloudFront既定ドメインの公開サイト、API、Cognito、DynamoDB、Lambdaは稼働中。
- 独自ドメインはACMのDNS検証待ちで、CloudFront aliasとCloudflare DNSは未変更。
- 直近の記録済みテスト結果はフロント47件、Lambda 24件、合計71件成功。
- 第2段階の独自ドメイン有効化・Cloudflare変更・追加AWS変更は、新しいPlanを作り、対象Planへの明示的な実行依頼がある場合だけ行う。

## 主要パス

| パス | 内容 |
|---|---|
| `implementation/app-site/` | HTML、CSS、JavaScript、フロントテスト |
| `implementation/lambda/` | Python Lambdaとunittest |
| `implementation/terraform/` | AWS Terraform定義と運用資料 |
| `implementation/csv/` | 実データを含み得るローカルCSV。通常は読まない |
| `materials/` | 構成図、Notionローカル版、成果物、画像、生成物 |
| `project-guidance/` | 現在コンテキスト、ガードレール、引継ぎ、プロンプト |
| `.agents/skills/` | 繰り返し作業のスキルと実行スクリプト |
| `.codex/agents/` | 担当別カスタムエージェント |

## 検証の入口

一括検証は次を使用する。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-spendops-project/scripts/Invoke-SpendOpsChecks.ps1
```

Terraformの読み取り確認とPlan作成は次を入口にする。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/manage-spendops-terraform/scripts/Invoke-TerraformReadiness.ps1
```

## コンテキスト節約規則

- 大きなファイルは最初から全読込せず、`rg`で対象の関数・見出し・設定を検索して該当範囲だけ読む。
- 特に`implementation/app-site/script.js`と`implementation/lambda/src/handler.py`は、機能名やシンボルで検索してから読む。
- READMEの対象範囲、現在状態、主要パス、テスト件数が変わった場合は、このファイルの対応箇所も同じ作業で更新する。
- CSV、画像、PPTX、DOCX、PDF、draw.io、中間生成物は、依頼で必要な場合だけ開く。
- 過去の履歴は日付や語句を`rg`で検索し、該当する履歴ファイルの必要部分だけ読む。
- サブエージェントには原則として会話履歴を渡さず、対象、目的、完了条件、参照パスだけを渡す。
