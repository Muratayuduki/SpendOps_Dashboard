# Lambdaだけが引き受けられる実行ロール
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_api" {
  name               = "${local.name_prefix}-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

# CloudWatch Logsへログを書き込むAWS管理ポリシー
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# アプリケーションが必要とするデータだけにアクセスを限定
data "aws_iam_policy_document" "lambda_data_access" {
  statement {
    sid    = "DynamoDBDataAccess"
    effect = "Allow"
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:UpdateItem",
    ]
    resources = [
      aws_dynamodb_table.transactions.arn,
      aws_dynamodb_table.user_monthly_summaries.arn,
      aws_dynamodb_table.import_batches.arn,
      aws_dynamodb_table.category_rules.arn,
    ]
  }
}

resource "aws_iam_role_policy" "lambda_data_access" {
  name   = "${local.name_prefix}-api-data-access"
  role   = aws_iam_role.lambda_api.id
  policy = data.aws_iam_policy_document.lambda_data_access.json
}
