# CSV取込、月別レポート、管理機能を1つの関数で処理するMVP構成
resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-api"
  description      = "SpendOps DashboardのCSV取込、月別レポート、管理機能API"
  role             = aws_iam_role.lambda_api.arn
  runtime          = "python3.13"
  handler          = var.lambda_handler
  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)
  memory_size      = 512
  timeout          = 30

  environment {
    variables = {
      ENVIRONMENT                  = var.environment
      TRANSACTIONS_TABLE           = aws_dynamodb_table.transactions.name
      USER_MONTHLY_SUMMARIES_TABLE = aws_dynamodb_table.user_monthly_summaries.name
      GROUP_MONTHLY_STATS_TABLE    = aws_dynamodb_table.group_monthly_stats.name
      IMPORT_BATCHES_TABLE         = aws_dynamodb_table.import_batches.name
      COGNITO_USER_POOL_ID         = aws_cognito_user_pool.main.id
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda_api,
    aws_iam_role_policy.lambda_data_access,
    aws_iam_role_policy_attachment.lambda_basic_execution,
  ]
}
