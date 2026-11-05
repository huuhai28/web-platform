#!/bin/sh
# Sinh file .env.prod với mật khẩu ngẫu nhiên. Chạy trên VPS:
#   sh scripts/gen_prod_env.sh > .env.prod && chmod 600 .env.prod && nano .env.prod
# Sau đó sửa DOMAIN, email và thông tin SMTP.
set -eu

rand() { openssl rand -hex "${1:-24}"; }

sed \
  -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(rand)/" \
  -e "s/^APP_DB_PASSWORD=.*/APP_DB_PASSWORD=$(rand)/" \
  -e "s/^KEYCLOAK_DB_PASSWORD=.*/KEYCLOAK_DB_PASSWORD=$(rand)/" \
  -e "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$(rand)/" \
  -e "s/^KEYCLOAK_ADMIN_PASSWORD=.*/KEYCLOAK_ADMIN_PASSWORD=$(rand 20)/" \
  -e "s/^PORTFOLIO_ADMIN_PASSWORD=.*/PORTFOLIO_ADMIN_PASSWORD=$(rand 12)/" \
  "$(dirname "$0")/../.env.prod.example"
