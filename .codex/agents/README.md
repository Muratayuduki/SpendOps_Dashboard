# SpendOps Dashboard custom agents

このディレクトリのTOMLファイルは、Codexのプロジェクトスコープのカスタムエージェント定義です。通常は`project-guidance/current-context.md`と`project-guidance/active-guardrails.md`だけを共通読込し、最新仕様と現在状態はルートの`README.md`を正本とします。

| エージェント名 | モデル・推論 | 呼び出す依頼 |
|---|---|---|
| `terraform_operator` | `gpt-5.6` / high | Terraform、AWS基盤、Plan、Apply、再構築、インフラ検証 |
| `document_author` | `gpt-5.6-terra` / medium | 企画書、展示資料、技術解説、構成図、Word、PowerPoint、Google資料 |
| `consistency_reviewer` | `gpt-5.6-terra` / high | READMEとの整合性、数値、時制、リンク、対象範囲の監査 |
| `daily_spec_logger` | `gpt-5.6-luna` / low | 当日の仕様変更、決定事項、未決事項、引継ぎ記録 |
| `verification_operator` | `gpt-5.6-luna` / low | フロント、Lambda、Terraformの一括検証、回帰確認、提出前確認 |

依頼例:

```text
terraform_operatorを使って、現在のTerraform構成をvalidateし、新しいPlanの差分だけ報告してください。
```

```text
document_authorを使って、README準拠の展示資料を更新してください。
```

```text
consistency_reviewerを使って、READMEと技術解説の不一致を確認してください。
```

```text
daily_spec_loggerを使って、今日確定した仕様変更をcurrent-handoffと月別履歴へ記録してください。
```

```text
verification_operatorを使って、フロント、Lambda、Terraformの一括検証を行ってください。
```

Codex公式のカスタムエージェント定義はMarkdownではなく`.codex/agents/*.toml`です。`.agents`は主にリポジトリスキルの配置に使用します。

rootから委譲する際は原則として会話履歴を継承せず、対象パス、依頼内容、完了条件だけを渡します。
