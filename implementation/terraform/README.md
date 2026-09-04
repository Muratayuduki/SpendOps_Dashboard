# SpendOps Dashboard Terraform

SpendOps DashboardのMVPで必要となるAWS基盤を管理します。現在の構成は、Cognito、DynamoDB、Lambda、API Gateway、IAM、CloudWatch Logs、S3、CloudFront、ACMです。

通知、監視アラーム、CI/CD、リモートStateは追加開発対象です。

## ファイル構成

- `provider.tf`: Terraform本体、AWS Provider、リージョン、共通タグ
- `variables.tf`: 環境ごとに変更する入力値
- `locals.tf`: 複数リソースで共有する名前とAPIルート
- `cognito.tf`: ユーザー認証と一般・管理者グループ
- `dynamodb.tf`: 正規化済み個別取引、月別集計、取込履歴、本人別分類ルールのテーブル
- `iam.tf`: Lambdaの実行ロールとアクセス権限
- `cloudwatch.tf`: LambdaとAPI Gatewayのログ
- `lambda.tf`: アプリケーションのバックエンド関数
- `api_gateway.tf`: HTTP API、JWT認証、ルート、Lambda接続
- `s3.tf`: 閲覧サイトの非公開バケットと静的ファイル配置
- `cloudfront.tf`: HTTPS配信とS3への限定アクセス
- `acm.tf`: `cache.yuduki0303.com`用のCloudFront証明書
- `outputs.tf`: 作成後にアプリへ設定する値
- `terraform.tfvars.example`: 入力値の記述例
- `.gitignore`: Stateやローカル設定の誤登録防止

Terraformはファイル名ではなく、同じディレクトリ内のすべての`.tf`をまとめて読み込みます。ここでは後から追いやすいようにAWSサービス単位で分割しています。

`versions.tf`は作成していません。Terraformは同じディレクトリの`.tf`ファイルをまとめて読み込むため、バージョン指定は`provider.tf`内で管理します。

## 構築対象

- Cognito User Pool、Webクライアント、一般ユーザー・管理者グループ
- 正規化済み個別取引、ユーザー月別集計、取込履歴、本人別分類ルールのDynamoDBテーブル
- 個別取引・月別集計保存、月別レポート、匿名比較、管理機能を担当する1つのLambda
- Cognito JWT認証付きHTTP API
- Lambda実行用の最小限のIAM権限
- LambdaとAPI GatewayのCloudWatch Logs
- 非公開S3とCloudFrontによるMVP閲覧サイト
- Cloudflareで管理する `cache.yuduki0303.com` 用のACM証明書

PayPay、JCB、三井住友VISAのCSVはブラウザ内で解析します。CSVファイル、ファイル名、カード番号、口座番号、CSVの未加工行はAWSへ送信・保存しません。Lambdaは正規化済みの取引日、金額、利用先、カテゴリ、支払い元と月別集計だけを検証してDynamoDBへ保存します。銀行CSVは今回の対象外です。

使いみちの修正は本人IDで分離した分類ルールとして保存します。分類ルール用テーブルへ利用先名そのものは保存せず、ブラウザで作成した照合用SHA-256値、支払い元、固定カテゴリだけを保存します。「学習内容の控え」はブラウザで作成・読取し、ファイル自体をAWSやTerraform stateへ保存しません。利用者が端末に保管した控えは、Destroy後に空の基盤を再構築した場合も再読込できます。

`protect_persistent_data = true` が既定値です。Cognito User Poolと4つのDynamoDBテーブルには削除保護が設定されます。意図的に削除する場合は、影響を確認したうえで削除保護を無効化する別Planと承認が必要です。

## 独自サブドメインの設定

独自サブドメインは停止を避けるため二段階で設定します。

1. `activate_custom_domain = false` のままACM証明書を申請する
2. `custom_domain_validation_records` のCNAMEをCloudflareへ「DNSのみ」で追加する
3. ACM証明書が発行済みになったことを確認する
4. `activate_custom_domain = true` に変更し、CloudFrontの別名・証明書とAPIの許可元を更新する
5. Cloudflareへ `cache` から `cloudfront_domain_name` への公開用CNAMEを「DNSのみ」で追加する

検証用CNAMEは証明書の自動更新にも必要なため、発行後も削除しません。Cloudflareのログイン情報やAPIトークンはTerraformへ保存しません。

## 事前準備

1. Terraform 1.10以上をインストールする
2. AWS CLIのプロファイルまたは環境変数で認証する
3. API用LambdaをZIP化し、`lambda_package_path`に配置する
4. `terraform.tfvars.example`を`terraform.tfvars`へコピーして値を確認する

アクセスキー、パスワード、CSVの内容などの秘密情報・個人情報はTerraformファイルへ記述しません。

## 確認手順

```powershell
powershell -ExecutionPolicy Bypass -File ..\..\.agents\skills\manage-spendops-terraform\scripts\Invoke-TerraformReadiness.ps1 `
  -Init -BuildLambda -Plan Apply `
  -PlanPath spendops-YYYYMMDD-HHMMSS.tfplan `
  -Variable activate_custom_domain=false
```

第1段階では`activate_custom_domain=false`を明示し、毎回新しいPlan名を使用します。`terraform apply`は、Planの内容とAWS料金への影響を確認した後に、承認済みの保存済みPlanだけを適用してください。

現時点ではローカルStateを使います。次回のPlanまたはApply前に、操作者を1人へ直列化し、`terraform.tfstate`の存在と対象AWSアカウントを確認したうえで、Git管理外の`state-backups/`へ回復用コピーを保存してください。複数人または本番運用へ移行する前に、ロックと暗号化を備えたリモートBackendを追加します。

## APIルート

公開デモ用:

- `GET /health`: API稼働確認
- `GET /demo/report`: 合成データの分析結果

認証必須:

- `POST /imports`: ブラウザで正規化した個別取引と月別集計の保存
- `GET /reports`: 本人の保存済み月別集計一覧
- `GET /transactions`: 本人の保存済み個別取引を最大5,000件取得
- `GET /category-rules`: 本人が学習させた分類ルールを取得
- `PUT /category-rules`: 本人の分類ルールを追加・更新
- `GET /reports/{month}`: 月別レポート取得
- `GET /admin/imports`: 管理者向け取込状況取得
- `DELETE /users/me`: 退会処理

公開ルートは合成データだけを返します。それ以外はCognitoのJWT認証を必須とします。管理者ルートはCognitoの`admins`グループを確認し、匿名比較は本人を除く同月の`partial=false`の月別集計がユニーク利用者5人以上にある場合だけ実平均を返します。支払い種別は条件にせず、同じ利用者の複数種別は合算して1人として扱います。
