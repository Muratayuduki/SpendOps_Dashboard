# SpendOps Dashboard custom agents

このディレクトリのTOMLファイルは、Codexのプロジェクトスコープのカスタムエージェント定義です。最新仕様と現在状態はルートの`README.md`を正本とします。

| エージェント名 | 呼び出す依頼 |
|---|---|
| `terraform_operator` | Terraform、AWS基盤、Plan、Apply、再構築、インフラ検証 |
| `document_author` | 企画書、展示資料、技術解説、構成図、Word、PowerPoint、Google資料 |
| `consistency_reviewer` | READMEとの整合性、数値、時制、リンク、対象範囲の監査 |
| `daily_spec_logger` | 当日の仕様変更、決定事項、未決事項、引継ぎ記録 |

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
daily_spec_loggerを使って、今日確定した仕様変更をcodex_handoffへ記録してください。
```

Codex公式のカスタムエージェント定義はMarkdownではなく`.codex/agents/*.toml`です。`.agents`は主にリポジトリスキルの配置に使用します。
