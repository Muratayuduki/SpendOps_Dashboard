# CSVから正規化した取引データ
resource "aws_dynamodb_table" "transactions" {
  name         = "${local.name_prefix}-transactions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "transaction_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "transaction_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# ユーザー本人へ表示する月別集計
resource "aws_dynamodb_table" "user_monthly_summaries" {
  name         = "${local.name_prefix}-user-monthly-summaries"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "month"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "month"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# 個人を特定できない比較用の月別集計
resource "aws_dynamodb_table" "group_monthly_stats" {
  name         = "${local.name_prefix}-group-monthly-stats"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "source"
  range_key    = "month"

  attribute {
    name = "source"
    type = "S"
  }

  attribute {
    name = "month"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# CSVごとの取込日時、成功件数、エラー件数
resource "aws_dynamodb_table" "import_batches" {
  name         = "${local.name_prefix}-import-batches"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "import_batch_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "import_batch_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
