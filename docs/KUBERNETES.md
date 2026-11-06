# Kubernetes + Helm + Kong Ingress

Deploy toàn bộ Personal Web Platform lên một cluster Kubernetes bằng **Helm chart** của repo, với
**Kong Ingress Controller** làm cổng vào (rate limit, request ID, giới hạn body, metrics).

## Kiến trúc trên cluster

```text
                       Kong Ingress Controller (namespace kong, proxy NodePort 30080)
Trình duyệt ──► http://personal-web.<node-ip>.nip.io:30080
                         │  KongPlugin: pw-request-id, pw-request-size, pw-prometheus
                         ├─ /             ─► Service frontend (nginx, 2 pod) ── /auth ─► keycloak
                         ├─ /api          ─► Service backend (FastAPI, HPA 2–5 pod)   + pw-api-rate-limit (120/phút/IP)
                         └─ POST /api/contact ─► backend                              + pw-contact-rate-limit (5/phút/IP)

namespace personal-web:
  Deployment frontend, backend (readiness /api/health/ready, liveness /api/health/live), worker, keycloak, mailpit, redis
  StatefulSet postgres + PVC     HPA backend     Secret platform-secrets (tạo ngoài chart)
```

Cùng một bộ plugin ở bản Docker Compose được khai báo bằng decK (`infra/kong/kong.yaml`); trên K8s khai báo
bằng CRD `KongPlugin` trong chart (`helm/personal-web/templates/kong-plugins.yaml`).

## Chuẩn bị (một lần)

1. **Cluster** có `kubectl` + `helm` dùng được (kubeadm, minikube, kind, k3s đều được).
2. **StorageClass mặc định** cho PVC của PostgreSQL. Kiểm tra: `kubectl get storageclass` (cần dòng có `(default)`).
   Chưa có thì dùng local-path-provisioner (script deploy sẽ in lệnh cài).
3. **metrics-server** (để HPA đọc CPU) — không bắt buộc, thiếu thì HPA hiện `<unknown>` nhưng app vẫn chạy.
4. **Image trên GHCR**: GitHub Actions đã build `ghcr.io/huuhai28/web-platform/{frontend,backend}`. Package mặc định
   là *private* → cluster không kéo được. Chọn một:
   - Đặt **public**: GitHub → Profile → **Packages** → `web-platform/frontend` → *Package settings* →
     *Change visibility* → Public. Làm tương tự cho `backend` (và `keycloak`). Public còn được lưu trữ miễn phí.
   - Hoặc giữ private và chạy script với `GHCR_USER=huuhai28 GHCR_TOKEN=<PAT có quyền read:packages>`.

## Deploy

Trên máy có quyền vào cluster (vd. node master):

```bash
git clone https://github.com/huuhai28/web-platform.git && cd web-platform
NODE_IP=192.168.0.111 bash scripts/k8s-lab-deploy.sh
```

Script [k8s-lab-deploy.sh](../scripts/k8s-lab-deploy.sh) làm lần lượt:

1. Kiểm tra cluster, StorageClass, metrics-server.
2. `helm upgrade --install kong kong/ingress` — Kong Ingress Controller, proxy NodePort 30080,
   `externalTrafficPolicy=Local` để giữ IP thật của người dùng (rate limit đúng từng IP).
3. Tạo namespace + Secret `platform-secrets` với mật khẩu ngẫu nhiên (không ghi đè nếu đã có).
4. `helm upgrade --install personal-web ... -f values-lab.yaml --atomic --wait` — lỗi thì tự rollback.
5. Tự kiểm tra: trang chủ, header `Via: kong`, `X-Request-ID`, `/api/health/ready`, rate limit trả 429.
6. In khối **KẾT QUẢ** (pods, services, ingress, HPA, KongPlugin, helm history).

Mở **http://personal-web.192.168.0.111.nip.io:30080** — `nip.io` tự phân giải về IP nằm trong tên miền nên không
cần sửa file hosts hay DNS.

Deploy bản cụ thể (bất biến) thay vì `latest`:

```bash
IMAGE_TAG=d7504ab bash scripts/k8s-lab-deploy.sh   # SHA 7 ký tự của commit đã build trên GitHub Actions
```

## Vận hành

```bash
kubectl -n personal-web get pods,ingress,hpa
kubectl -n personal-web get kongplugins
kubectl -n personal-web logs deploy/backend -f            # log JSON có request_id
helm -n personal-web history personal-web
helm -n personal-web rollback personal-web <REVISION> --wait
```

Thử HPA (cần metrics-server): tạo tải vào API rồi xem số pod tăng.

```bash
kubectl -n personal-web run load --rm -it --image=busybox:1.36 --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://backend:8000/api/projects >/dev/null; done'
kubectl -n personal-web get hpa backend -w
```

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân / xử lý |
|---|---|
| Pod `ImagePullBackOff` | Package GHCR đang private → đặt public hoặc chạy script với `GHCR_USER`/`GHCR_TOKEN` |
| `postgres-0` Pending, PVC Pending | Chưa có StorageClass mặc định → cài local-path-provisioner (lệnh in ra trong script) |
| `keycloak` Running nhưng chưa Ready lâu | `start-dev` cần 1–2 phút và ~1 GB RAM lần đầu; xem `kubectl -n personal-web logs deploy/keycloak` |
| Truy cập 30080 không được | Firewall node chặn cổng 30080, hoặc dùng sai IP node trong `NODE_IP` |
| HPA `<unknown>` | Chưa có metrics-server |
| Đăng nhập báo *Invalid redirect_uri* | Realm được import với URL cũ → xóa pod keycloak và PVC postgres để import lại, hoặc sửa client trong Keycloak admin |

## Kiểm tra trong CI

GitHub Actions render chart với cả `values.yaml` (NodePort) và `values-lab.yaml` (Kong Ingress + HPA) rồi chạy
`kubeconform`, dùng schema CRD của Kong từ [CRDs-catalog](https://github.com/datreeio/CRDs-catalog) để kiểm tra luôn
các `KongPlugin`.
