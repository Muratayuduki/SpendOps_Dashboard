variable "aws_region" {
  description = "AWSリソースを作成するリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "リソース名とタグに使用するプロジェクト名"
  type        = string
  default     = "spendops-dashboard"
}

variable "environment" {
  description = "実行環境名"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "stg", "prod"], var.environment)
    error_message = "environment は dev、stg、prod のいずれかを指定してください。"
  }
}

variable "lambda_package_path" {
  description = "API用Lambdaへ配置するZIPファイルのパス"
  type        = string
  default     = "../lambda/dist/spendops_api.zip"
}

variable "lambda_handler" {
  description = "API用Lambdaのハンドラー"
  type        = string
  default     = "handler.lambda_handler"
}

variable "allowed_origins" {
  description = "HTTP APIへのアクセスを許可するフロントエンドのオリジン"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "log_retention_days" {
  description = "CloudWatch Logsの保持日数"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365], var.log_retention_days)
    error_message = "log_retention_days にはCloudWatch Logsが対応する保持日数を指定してください。"
  }
}

variable "additional_tags" {
  description = "全AWSリソースへ追加する任意のタグ"
  type        = map(string)
  default     = {}
}
