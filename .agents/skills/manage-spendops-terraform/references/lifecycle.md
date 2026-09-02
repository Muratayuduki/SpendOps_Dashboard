# Terraformライフサイクル手順

## 構築・再構築

1. AWSアカウント、リージョン`ap-northeast-1`、workspace、state、tfvars、Lambda ZIPを確認する。
2. 第1段階は`activate_custom_domain = false`を明示し、基盤と`us-east-1`のACM証明書を対象に新しいPlanを作る。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/manage-spendops-terraform/scripts/Invoke-TerraformReadiness.ps1 -Init -BuildLambda -Plan Apply -PlanPath spendops-YYYYMMDD-HHMM.tfplan -Variable activate_custom_domain=false
```
3. Planで追加・変更・削除、置換、IAM、公開範囲、料金、永続データ保護を監査する。
4. 今回のPlanへの承認後、保存したPlanだけを`terraform apply <plan-file>`で適用する。
5. Terraform outputとCloudflareのDNS検証用CNAMEを照合する。Cloudflare変更はTerraform外の別操作として扱う。
6. ACMが`ISSUED`になった後、`activate_custom_domain = true`で新しい第2段階Planを作る。
7. CloudFront alias・証明書とAPI CORSが想定差分であることを確認し、別承認後に適用する。
8. 公開用CNAME更新、CloudFront invalidation、公開E2Eは外部変更として個別承認を得る。

## 削除保護解除

1. Cognito User PoolとDynamoDB 4テーブルの保護状態、件数、PITR、バックアップ方針を確認する。実データ内容は出力しない。
2. `protect_persistent_data = false`だけを対象に新しいPlanを作る。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/manage-spendops-terraform/scripts/Invoke-TerraformReadiness.ps1 -Plan Apply -PlanPath spendops-unprotect-YYYYMMDD-HHMM.tfplan -Variable protect_persistent_data=false
```
3. Cognito 1件とDynamoDB 4テーブルの保護解除以外に差分がないことを確認する。
4. 専用承認後にPlanを適用する。Destroy承認と兼用しない。

## Destroy

1. 削除対象、不可逆データ、Cognitoの復旧制約、DynamoDBバックアップ、Terraform管理外のCloudflare DNSを説明する。
2. 保護解除後のコードとstateから新しいDestroy Planを作る。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/manage-spendops-terraform/scripts/Invoke-TerraformReadiness.ps1 -Plan Destroy -PlanPath spendops-destroy-YYYYMMDD-HHMM.tfplan
```

3. 追加0、想定外変更0、全対象が削除であることを確認する。
4. 削除件数、残すバックアップ、Terraform管理外項目を再提示し、今回のDestroy Planへの最終承認を得る。
5. 直接`terraform destroy`を使わず、`terraform apply <destroy-plan-file>`で承認済みPlanだけを適用する。
6. stateが0件であることを確認する。
7. Cognito、DynamoDB、Lambda、API Gateway、S3、CloudFront、ACM、CloudWatch Logs、IAMの対象残存が0件であることを読み取り専用APIで確認する。
8. オンデマンドバックアップ、自動失効待ちシステムバックアップ、Cloudflare CNAMEを残存リソースと分けて報告する。

## 停止条件

- Plan生成後にコード、tfvars、Lambda ZIP、state、workspace、Provider lock、他者の編集が変わった。
- `-/+`または`+/-`の置換が想定外に含まれる。
- IAM Action/Resource、API公開ルート、CORS、S3 policyの範囲が拡大する。
- `force_destroy`、削除保護、PITR、ログ保持、暗号化が意図せず弱くなる。
- S3の未管理オブジェクトなどによりDestroy対象が説明と一致しない。
- AWSアカウントまたはリージョンが想定と一致しない。

## 検証項目

構築後はDynamoDB 4テーブルのACTIVE・PITR・暗号化・削除保護、Cognitoの保護とgroups、IAMの4テーブル限定権限、公開APIとJWT保護API、S3非公開とOAC、CloudFront HTTPS/TLS/alias、ACM ISSUED、CloudWatchの機密情報非記録、公開資産とhealth、再Plan差分なしを確認する。
