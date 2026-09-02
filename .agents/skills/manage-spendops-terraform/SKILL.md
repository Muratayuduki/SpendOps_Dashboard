---
name: manage-spendops-terraform
description: SpendOps DashboardのTerraform/AWS基盤について、init、fmt、validate、state確認、Plan監査、承認済みApply、二段階再構築、削除保護解除、Destroy、構築後・破壊後検証を安全に実行する。ユーザーがTerraform、AWS基盤、構築、再構築、Plan、Apply、Destroy、破壊、削除保護、state、インフラ検証を依頼したときに使用する。
---

# SpendOps Terraformを管理する

## 正本と現在状態を確認する

1. `project-guidance/current-context.md`、`project-guidance/active-guardrails.md`、`implementation/terraform/README.md`を読む。
2. 現在の停止地点が関係する場合だけ`project-guidance/current-handoff.md`を読み、仕様詳細は`README.md`の関連見出しだけを検索する。
3. `git status --short`、Terraform workspace、state、AWSアカウントとリージョンを確認する。他者の編集中はPlanとApplyを直列化する。
4. `terraform_operator`が利用可能なら、会話履歴を渡さず対象操作、対象パス、完了条件だけで委譲し、rootでPlan内容と承認境界を統合する。

## 操作を分類する

- `fmt -check`、`validate`、state確認、Plan作成、読み取り専用確認は、依頼範囲内で実行する。
- Apply、Destroy、削除保護解除、AWS変更、デプロイ、外部公開は、今回作成したPlanの影響を提示し、ユーザーがそのPlanの実行を明示承認した後だけ行う。
- 予期しない削除・置換、権限拡大、公開範囲拡大、料金増加があれば停止する。
- 過去のPlan、`-auto-approve`、直接の`terraform destroy`、通常運用での`-target`や`-refresh=false`を使用しない。

## 読み取り・Planを実行する

`scripts/Invoke-TerraformReadiness.ps1`を使用する。Planファイルは毎回新しい名前を指定し、既存ファイルの上書きや再利用を拒否する。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/manage-spendops-terraform/scripts/Invoke-TerraformReadiness.ps1
```

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/manage-spendops-terraform/scripts/Invoke-TerraformReadiness.ps1 -Init -BuildLambda -Plan Apply -PlanPath spendops-YYYYMMDD-HHMM.tfplan -Variable activate_custom_domain=false
```

構築、再構築、削除保護解除、Destroyを扱う場合だけ`references/lifecycle.md`を読む。

## Planを監査して報告する

- 追加・変更・削除件数と置換を示す。
- 永続データ、削除保護、PITR、IAM、公開ルート、CORS、S3公開制御、CloudFront、ACM、Lambda、CloudWatch、料金への影響を示す。
- Apply後はstate、AWS対象リソース、HTTP/API、未認証401、再Planの差分なしを確認する。
- 実データ、利用先、金額、認証情報、Cloudflare秘密情報を出力しない。
