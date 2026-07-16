# SpendOps Dashboard Terraform

SpendOps DashboardのMVPで必要となるAWS基盤を管理します。現在の構成は、Cognito、DynamoDB、Lambda、API Gateway、IAM、CloudWatch Logs、S3、CloudFrontです。

独自ドメイン、通知、監視アラーム、CI/CD、リモートStateは追加開発対象です。

## ファイル構成

- `provider.tf`: Terraform本体、AWS Provider、リージョン、共通タグ
- `variables.tf`: 環境ごとに変更する入力値
- `locals.tf`: 複数リソースで共有する名前とAPIルート
- `cognito.tf`: ユーザー認証と一般・管理者グループ
- `dynamodb.tf`: 取引、月別集計、匿名比較、取込履歴テーブル
- `iam.tf`: Lambdaの実行ロールとアクセス権限
- `cloudwatch.tf`: LambdaとAPI Gatewayのログ
- `lambda.tf`: アプリケーションのバックエンド関数
- `api_gateway.tf`: HTTP API、JWT認証、ルート、Lambda接続
- `s3.tf`: 閲覧サイトの非公開バケットと静的ファイル配置
- `cloudfront.tf`: HTTPS配信とS3への限定アクセス
- `outputs.tf`: 作成後にアプリへ設定する値
- `terraform.tfvars.example`: 入力値の記述例
- `.gitignore`: Stateやローカル設定の誤登録防止

Terraformはファイル名ではなく、同じディレクトリ内のすべての`.tf`をまとめて読み込みます。ここでは後から追いやすいようにAWSサービス単位で分割しています。

`versions.tf`は作成していません。Terraformは同じディレクトリの`.tf`ファイルをまとめて読み込むため、バージョン指定は`provider.tf`内で管理します。

## 構築対象

- Cognito User Pool、Webクライアント、一般ユーザー・管理者グループ
- 取引、ユーザー月別集計、匿名グループ月別集計、取込履歴のDynamoDBテーブル
- CSV取込・月別レポート・管理機能を担当する1つのLambda
- Cognito JWT認証付きHTTP API
- Lambda実行用の最小限のIAM権限
- LambdaとAPI GatewayのCloudWatch Logs
- 非公開S3とCloudFrontによるMVP閲覧サイト

生のCSVファイルはAWS上へ保存せず、Lambda内で処理した正規化済みデータだけをDynamoDBへ保存する想定です。

## 事前準備

1. Terraform 1.10以上をインストールする
2. AWS CLIのプロファイルまたは環境変数で認証する
3. API用LambdaをZIP化し、`lambda_package_path`に配置する
4. `terraform.tfvars.example`を`terraform.tfvars`へコピーして値を確認する

アクセスキー、パスワード、CSVの内容などの秘密情報・個人情報はTerraformファイルへ記述しません。

## 確認手順

```powershell
terraform init
..\lambda\build.ps1
terraform fmt -check
terraform validate
terraform plan -out=spendops.tfplan
```

`terraform apply`は、Planの内容とAWS料金への影響を確認した後に実行してください。現時点ではローカルStateを使うため、複数人または本番運用へ移行する前にS3などのリモートBackendを追加します。

## APIルート

公開デモ用:

- `GET /health`: API稼働確認
- `GET /demo/report`: 合成データの分析結果

認証必須:

- `POST /imports`: CSV取込
- `GET /reports/{month}`: 月別レポート取得
- `GET /admin/imports`: 管理者向け取込状況取得
- `DELETE /users/me`: 退会処理

公開ルートは合成データだけを返します。それ以外はCognitoのJWT認証を必須とします。管理者ルートのグループ判定、AWSへの本CSV取込、重複判定、部分成功、匿名比較の最低人数ルールは次段階で実装します。
