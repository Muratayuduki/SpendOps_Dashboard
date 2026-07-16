output "aws_region" {
  description = "AWSリソースを作成するリージョン"
  value       = var.aws_region
}

output "api_endpoint" {
  description = "フロントエンドから使用するHTTP APIのエンドポイント"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "site_url" {
  description = "CloudFrontで公開するMVP閲覧サイト"
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "web_bucket_name" {
  description = "Webファイルを保存する非公開S3バケット名"
  value       = aws_s3_bucket.web.id
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  description = "Webフロントエンド用Cognito Client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "lambda_function_name" {
  description = "API用Lambda関数名"
  value       = aws_lambda_function.api.function_name
}

output "dynamodb_table_names" {
  description = "アプリケーションが使用するDynamoDBテーブル名"
  value = {
    transactions           = aws_dynamodb_table.transactions.name
    user_monthly_summaries = aws_dynamodb_table.user_monthly_summaries.name
    group_monthly_stats    = aws_dynamodb_table.group_monthly_stats.name
    import_batches         = aws_dynamodb_table.import_batches.name
  }
}
