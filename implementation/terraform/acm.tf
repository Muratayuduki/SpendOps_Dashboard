# CloudFront用の公開証明書は米国東部リージョンで申請する。
# Cloudflareへ検証用CNAMEを追加し、証明書が発行されてから
# activate_custom_domainをtrueへ変更してCloudFrontへ接続する。
resource "aws_acm_certificate" "cloudfront" {
  provider          = aws.us_east_1
  domain_name       = var.custom_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}
