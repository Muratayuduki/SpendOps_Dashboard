# SpendOps Dashboard 現在コンテキスト

更新日: 2026-09-11（Asia/Tokyo）

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
- 実ユーザー比較は支払い種別を条件にせず、本人を除く同月の`partial=false`の月別集計を利用者単位で合算し、他5人以上の場合に表示する。
- ソース別の最終取込日と未取込警告は未実装。

## 現在状態

- AWS基盤は2026-09-11に、ユーザー承認済みの保存済みDestroy PlanでTerraform管理の42リソースを削除済み。
- Terraform stateは0エントリ。削除前と削除保護解除後のローカルstateバックアップを保持している。
- CloudFront、S3、API Gateway、Lambda、Cognito、DynamoDBは削除済みで、公開サイト、API、認証、クラウド保存は現在利用できない。
- 2026-09-03にLambdaと公開画面の`auth.js`、`script.js`、`styles.css`を更新済み（Terraform Applyは0件追加、4件変更、0件削除）。
- 2026-09-03に実装した、比較方法を独立した選択カードとして示す表示改善は、2026-09-07の本番構築で公開環境へ反映済み。
- ACM証明書はDestroy前にAWS上で削除済み。Cloudflare DNSはTerraform管理外で、今回のDestroyでは変更していない。
- 直近の記録済みテスト結果はフロント47件、Lambda 24件、合計71件成功。
- 認証後の実ユーザー比較成立ケースは公開E2E未確認。
- レビュー指摘1〜3を反映した17区間の音声と焼き込み字幕を割り当て、修正版MP4を生成した。5分00秒の全編デコードと、冒頭・中盤・終盤の字幕表示を確認済み。
- Google Sites版の録画と指定背景を基準に再構成した紹介サイト、5分動画、企画書PDF、AWS構成図は、リポジトリ外の`C:\development\SpendOps_Dashboard_Material\`へ分離済み。移動前にローカルHTTP 200、動画Range配信206、企画書PDFの`application/pdf`配信を確認済み。外部公開は未実施。
- AWSを再構築する場合は、現在のstate 0件から新しいPlanを作り、対象Planへの明示的な実行依頼がある場合だけ行う。

## 主要パス

| パス | 内容 |
|---|---|
| `implementation/app-site/` | HTML、CSS、JavaScript、フロントテスト |
| `implementation/lambda/` | Python Lambdaとunittest |
| `implementation/terraform/` | AWS Terraform定義と運用資料 |
| `implementation/csv/` | 実データを含み得るローカルCSV。通常は読まない |
| `C:\development\SpendOps_Dashboard_Material\` | リポジトリ外へ分離した現行AWS構成図、最新の完成デモ動画、紹介サイト |
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
