# Helm chart: personal-web

> Deploy lên cluster lab có Kong Ingress: xem **[docs/KUBERNETES.md](../../docs/KUBERNETES.md)** và `values-lab.yaml`.

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
  --set frontend.image.repository=ghcr.io/huuhai28/web-platform/frontend \
  --set frontend.image.tag=<commit-sha> \
  --set backend.image.repository=ghcr.io/huuhai28/web-platform/backend \
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
| `frontend.service.nodePort` | Cổng NodePort public (bắt buộc khi `service.type=NodePort`) |
| `*.image.repository` / `*.image.tag` | Image do GitHub Actions build lên GHCR, tag = commit SHA (bất biến) |
| `*.replicas`, `*.resources` | Số pod và giới hạn CPU/RAM từng service |
| `postgres.storage`, `postgres.storageClass` | Dung lượng PVC của PostgreSQL |
| `frontend.service.type` | `NodePort` (truy cập thẳng) hoặc `ClusterIP` (khi dùng Ingress) |
| `ingress.enabled`, `ingress.host`, `ingress.className` | Ingress qua Kong Ingress Controller (3 Ingress: `/`, `/api`, `POST /api/contact`) |
| `kongPlugins.*` | Rate limit API / form liên hệ, giới hạn body, bật plugin prometheus |
| `autoscaling.{backend,frontend}.*` | HPA theo CPU (cần metrics-server) |
| `imagePullSecrets` | Kéo image private (vd. GHCR) |

## Ghi chú

- Chart này là bản **lab**: Keycloak chạy `start-dev`, email đi vào Mailpit. Bản production trên VPS
  dùng `docker-compose.prod.yml` (Keycloak `start --optimized`, HTTPS bằng Caddy) — xem `docs/DEPLOY.md`.
- Đổi Secret không tự đổi mật khẩu user DB đã tạo trong PostgreSQL/Keycloak; xoay mật khẩu là một thao tác riêng.
- Không trộn `kubectl apply -k k8s/base` với Helm trên cùng namespace — chọn một trong hai.
