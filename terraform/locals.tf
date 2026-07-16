locals {
  name_prefix = "${var.project_name}-${var.environment}"

  authenticated_routes = toset([
    "POST /imports",
    "GET /reports",
    "GET /reports/{month}",
    "GET /admin/imports",
    "DELETE /users/me",
  ])

  public_routes = toset([
    "GET /health",
    "GET /demo/report",
  ])
}
