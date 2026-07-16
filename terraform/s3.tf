locals {
  web_assets = {
    "index.html" = {
      source        = "${path.module}/../app-site/index.html"
      content_type  = "text/html; charset=utf-8"
      cache_control = "no-cache"
    }
    "styles.css" = {
      source        = "${path.module}/../app-site/styles.css"
      content_type  = "text/css; charset=utf-8"
      cache_control = "public, max-age=300"
    }
    "script.js" = {
      source        = "${path.module}/../app-site/script.js"
      content_type  = "application/javascript; charset=utf-8"
      cache_control = "public, max-age=300"
    }
    "auth.js" = {
      source        = "${path.module}/../app-site/auth.js"
      content_type  = "application/javascript; charset=utf-8"
      cache_control = "public, max-age=300"
    }
    "comparison-data.js" = {
      source        = "${path.module}/../app-site/comparison-data.js"
      content_type  = "application/javascript; charset=utf-8"
      cache_control = "no-cache"
    }
  }

  web_config = <<-EOT
    window.SPENDOPS_CONFIG = {
      apiBaseUrl: "${aws_apigatewayv2_api.main.api_endpoint}",
      awsRegion: "${var.aws_region}",
      cognitoClientId: "${aws_cognito_user_pool_client.web.id}",
    };
  EOT
}

# Webファイルを保存する非公開バケット
resource "aws_s3_bucket" "web" {
  bucket_prefix = "${local.name_prefix}-web-"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_object" "web_assets" {
  for_each = local.web_assets

  bucket        = aws_s3_bucket.web.id
  key           = each.key
  source        = each.value.source
  source_hash   = filemd5(each.value.source)
  content_type  = each.value.content_type
  cache_control = each.value.cache_control
}

# 公開可能なAPI URL・リージョン・CognitoクライアントIDをTerraformで差し込む。
resource "aws_s3_object" "web_config" {
  bucket        = aws_s3_bucket.web.id
  key           = "config.js"
  content       = local.web_config
  source_hash   = md5(local.web_config)
  content_type  = "application/javascript; charset=utf-8"
  cache_control = "no-cache"
}
