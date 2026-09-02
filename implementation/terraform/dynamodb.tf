# CSV原本は保存せず、ブラウザで正規化した本人の個別取引を保存する。
# transaction_key は YYYY-MM-DD#SOURCE#HASH とし、ユーザー単位で月別検索できるようにする。
resource "aws_dynamodb_table" "transactions" {
  name                        = "${local.name_prefix}-transactions"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "user_id"
  range_key                   = "transaction_key"
  deletion_protection_enabled = var.protect_persistent_data

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "transaction_key"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

# 個別取引からブラウザで作成した月別集計も保存する。
resource "aws_dynamodb_table" "user_monthly_summaries" {
  name                        = "${local.name_prefix}-user-monthly-summaries"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "user_id"
  range_key                   = "month"
  deletion_protection_enabled = var.protect_persistent_data

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

# CSVごとの取込日時、集計件数、検証件数、同意バージョンだけを保存する。
resource "aws_dynamodb_table" "import_batches" {
  name                        = "${local.name_prefix}-import-batches"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "user_id"
  range_key                   = "import_batch_id"
  deletion_protection_enabled = var.protect_persistent_data

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

# 利用先名そのものではなく、ブラウザで作成した照合用ハッシュと本人の分類だけを保存する。
resource "aws_dynamodb_table" "category_rules" {
  name                        = "${local.name_prefix}-category-rules"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "user_id"
  range_key                   = "rule_key"
  deletion_protection_enabled = var.protect_persistent_data

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "rule_key"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}
