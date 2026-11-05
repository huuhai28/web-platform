#!/bin/sh
# Chạy MỘT LẦN khi volume PostgreSQL còn trống (docker-entrypoint-initdb.d).
# Tạo user riêng cho từng service thay vì dùng chung superuser "postgres":
#   - portfolio: chỉ có quyền trên database "portfolio" (FastAPI + Celery)
#   - keycloak:  chỉ có quyền trên database "keycloak"
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_pw="$APP_DB_PASSWORD" -v kc_pw="$KEYCLOAK_DB_PASSWORD" <<'SQL'
CREATE ROLE portfolio LOGIN PASSWORD :'app_pw';
CREATE ROLE keycloak  LOGIN PASSWORD :'kc_pw';
CREATE DATABASE portfolio OWNER portfolio;
CREATE DATABASE keycloak  OWNER keycloak;
REVOKE ALL ON DATABASE portfolio FROM PUBLIC;
REVOKE ALL ON DATABASE keycloak  FROM PUBLIC;
SQL
