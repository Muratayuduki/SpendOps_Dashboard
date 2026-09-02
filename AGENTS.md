# Codex Instructions

このリポジトリで作業するCodexは、ユーザーから個別に指示がなくても、作業開始前に必ず次の2ファイルを読むこと。

1. `project-guidance/current-context.md`
2. `project-guidance/active-guardrails.md`

## 作業開始時のルール

- `project-guidance/current-context.md`でプロジェクト要約、現在状態、主要パスを確認する
- `project-guidance/active-guardrails.md`で常時適用する安全規則と実行境界を確認する
- 現在の停止地点や次回作業が関係する場合だけ`project-guidance/current-handoff.md`を読む
- 最新仕様の詳細が必要な場合だけ`README.md`の該当見出しを検索して読む。READMEを最新仕様と現在状態の正本とする
- 過去履歴は`project-guidance/history/`、設計背景は`project-guidance/archive/`から必要箇所だけ検索する
- 既存資料、既存コード、既存draw.ioを確認してから変更する
- 不明点が成果物の品質に大きく影響する場合は、推測せず質問する
- 軽微な不明点は、仮定を明示して前に進める
- 個人情報、金融情報、メール本文全文、カード番号、ログイン情報、認証コードを保存・出力しない
- 破壊的変更、削除、外部公開、本番デプロイ、秘密情報の変更は事前確認する
- 大きなソースや資料を最初から全文読込しない。`rg`でシンボル・見出し・語句を検索し、該当範囲だけ読む
- `implementation/app-site/script.js`と`implementation/lambda/src/handler.py`は部分読込を標準とする

## 最新仕様の要点

- 最新仕様と現在状態の正本は`README.md`とする
- 対象はPayPayとクレジットカードで、現行実装はPayPay、JCB、三井住友VISAに対応する
- 横浜銀行を含む銀行CSVは今回の対象外とする
- 対象データはCSVアップロード時に反映する
- ユーザーが任意のタイミングでCSVをアップロードし、その日までの暫定分析を行う
- 取引データは日付単位で保存し、分析・画面表示は月別を中心にする
- 月別レポート画面を最優先にする
- 各取得元の最終取込日と未取込警告は未実装の残課題とする
- AWS基盤はTerraformで構築・管理する。現在はDestroy済みでstateは0エントリ
- Terraformの詳細説明は補足資料へ置く

## サブエージェントの呼び分け

プロジェクト固有のカスタムエージェント定義は`.codex/agents/`に置く。ユーザーの依頼が次の担当範囲に一致する場合は、原則として対応するカスタムエージェントへ委譲し、rootが結果を統合する。機能実装は`implementation/`、資料は`materials/`、プロンプト・ガードレール・引継ぎは`project-guidance/`に置く。

サブエージェントは原則として`fork_turns="none"`で起動し、依頼内容、対象パス、完了条件、必要な現在コンテキストだけを渡す。会話上の判断そのものが必要な場合だけ、最小限の直近ターンを渡す。同じファイルへ書き込む担当は並列化しない。

- Terraform、AWS基盤、Plan、Apply、再構築、インフラ検証: `terraform_operator`
- 企画書、展示資料、技術解説、構成図、Word、PowerPoint、Google資料: `document_author`
- READMEを正本とする内容・数値・時制・リンクの監査: `consistency_reviewer`
- 当日の仕様変更、確定事項、未決事項、引継ぎ記録: `daily_spec_logger`
- フロント、Lambda、Terraformの一括検証、回帰確認、提出前確認: `verification_operator`

## リポジトリスキルの使用

- 「日報を書いて」「今日の作業をまとめて」など、当日の実績・残課題・今後の開発工程を求める依頼では、`.agents/skills/write-daily-report/SKILL.md`の`$write-daily-report`を使用する。
- 日報は原則として回答だけを行い、ユーザーが保存・記録・追記を明示した場合だけファイルへ反映する。
- 確定した仕様変更を`project-guidance/current-handoff.md`へ記録する依頼は、`daily_spec_logger`へ引き継ぐ。古い履歴は月単位で`project-guidance/history/`へ移す。
- READMEの対象範囲、現在状態、主要パス、テスト件数を変更した場合は、`project-guidance/current-context.md`の対応箇所も更新する。
- Terraform、AWS基盤、Plan、Apply、Destroy、再構築では、`.agents/skills/manage-spendops-terraform/SKILL.md`の`$manage-spendops-terraform`を使用する。
- テスト、一括検証、回帰確認、提出前確認では、`.agents/skills/verify-spendops-project/SKILL.md`の`$verify-spendops-project`を使用する。

複数の担当が必要な場合は、書き込み競合を避けるため、Terraform実行結果、日次記録、資料反映、整合性確認の順に処理する。整合性確認担当は読み取り専用とする。
