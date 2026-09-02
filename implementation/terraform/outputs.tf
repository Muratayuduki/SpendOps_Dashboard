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
  value       = var.activate_custom_domain ? "https://${var.custom_domain_name}" : "https://${aws_cloudfront_distribution.web.domain_name}"
}

output "cloudfront_domain_name" {
  description = "Cloudflareの公開用CNAMEが参照するCloudFrontドメイン"
  value       = aws_cloudfront_distribution.web.domain_name
}

output "custom_domain_validation_records" {
  description = "CloudflareへDNSのみで追加するACM証明書検証用CNAME"
  value = {
    for option in aws_acm_certificate.cloudfront.domain_validation_options : option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }
}

output "custom_domain_certificate_arn" {
  description = "CloudFront用ACM証明書の識別子"
  value       = aws_acm_certificate.cloudfront.arn
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
    import_batches         = aws_dynamodb_table.import_batches.name
    category_rules         = aws_dynamodb_table.category_rules.name
  }
}
