# Helm chart: personal-web

Deploy toàn bộ Personal Web Platform lên Kubernetes: frontend (nginx), backend + Celery worker,
Keycloak, PostgreSQL (StatefulSet + PVC), Redis và Mailpit. Mật khẩu **không** nằm trong `values.yaml`
mà đọc từ Kubernetes Secret có sẵn (`existingSecret`, mặc định `platform-secrets`).

## Cài đặt nhanh

```bash
kubectl create namespace personal-web

# Secret dùng chung cho các service (đổi giá trị thật, không commit)
kubectl -n personal-web create secret generic platform-secrets \
  --from-literal=postgres-password="$(openssl rand -hex 24)" \
  --from-literal=keycloak-admin=admin \
  --from-literal=keycloak-admin-password="$(openssl rand -hex 16)"

helm upgrade --install personal-web ./helm/personal-web \
  --namespace personal-web \
  --set-string global.externalUrl="http://<node-ip>:30777" \
  --set frontend.service.nodePort=30777 \
  --set-string backend.config.contactReceiverEmail="you@example.com" \
  --set frontend.image.repository=registry.gitlab.com/<user>/personal-web-platform/frontend \
  --set frontend.image.tag=<commit-sha> \
  --set backend.image.repository=registry.gitlab.com/<user>/personal-web-platform/backend \
  --set backend.image.tag=<commit-sha> \
  --wait --timeout 10m
```

Kiểm tra và rollback:

```bash
kubectl -n personal-web get pods
helm -n personal-web history personal-web
helm -n personal-web rollback personal-web <REVISION> --wait
```

## Giá trị chính (`values.yaml`)

| Key | Ý nghĩa |
|---|---|
| `global.externalUrl` | URL người dùng truy cập (bắt buộc) — dùng cho Keycloak issuer, redirect URI, CORS |
| `existingSecret` | Tên Secret chứa `postgres-password`, `keycloak-admin`, `keycloak-admin-password` |
| `frontend.service.nodePort` | Cổng NodePort public (bắt buộc) |
| `*.image.repository` / `*.image.tag` | Image do GitLab CI build, tag = commit SHA (bất biến) |
| `*.replicas`, `*.resources` | Số pod và giới hạn CPU/RAM từng service |
| `postgres.storage`, `postgres.storageClass` | Dung lượng PVC của PostgreSQL |

## Ghi chú

- Chart này là bản **lab**: Keycloak chạy `start-dev`, email đi vào Mailpit. Bản production trên VPS
  dùng `docker-compose.prod.yml` (Keycloak `start --optimized`, HTTPS bằng Caddy) — xem `docs/DEPLOY.md`.
- Đổi Secret không tự đổi mật khẩu user DB đã tạo trong PostgreSQL/Keycloak; xoay mật khẩu là một thao tác riêng.
- Không trộn `kubectl apply -k k8s/base` với Helm trên cùng namespace — chọn một trong hai.
