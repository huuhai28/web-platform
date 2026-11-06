#!/usr/bin/env bash
# =============================================================================
# Deploy Personal Web Platform lên cluster Kubernetes lab bằng Helm, có Kong Ingress Controller.
#
# Chạy trên máy có kubectl + helm trỏ vào cluster (vd. node master 192.168.0.111):
#   git clone https://github.com/huuhai28/web-platform.git && cd web-platform
#   bash scripts/k8s-lab-deploy.sh
#
# Biến tùy chọn:
#   NODE_IP=192.168.0.111     IP một node bất kỳ (dùng cho URL nip.io và kiểm tra)
#   IMAGE_TAG=latest          tag image trên GHCR (nên dùng commit SHA 7 ký tự)
#   GHCR_USER / GHCR_TOKEN    nếu package GHCR để private (token cần quyền read:packages)
#   SKIP_KONG=1               bỏ qua bước cài Kong (đã cài rồi)
#
# Cuối script in ra phần "KẾT QUẢ" — copy toàn bộ gửi lại để kiểm tra.
# =============================================================================
set -euo pipefail

NODE_IP="${NODE_IP:-192.168.0.111}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
NS=personal-web
RELEASE=personal-web
HOST="personal-web.${NODE_IP}.nip.io"
URL="http://${HOST}:30080"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

log "0. Kiểm tra công cụ và cluster"
for c in kubectl helm curl openssl; do command -v "$c" >/dev/null || { echo "Thiếu $c"; exit 1; }; done
kubectl cluster-info | head -1
kubectl get nodes -o wide

if ! kubectl get storageclass 2>/dev/null | grep -q "(default)"; then
  warn "Chưa có StorageClass mặc định → PVC của PostgreSQL sẽ Pending."
  warn "Cài nhanh: kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.30/deploy/local-path-storage.yaml"
  warn "           kubectl patch storageclass local-path -p '{\"metadata\":{\"annotations\":{\"storageclass.kubernetes.io/is-default-class\":\"true\"}}}'"
fi
if ! kubectl top nodes >/dev/null 2>&1; then
  warn "metrics-server chưa chạy → HPA sẽ hiện <unknown> (app vẫn chạy bình thường với 2 replica)."
fi

if [[ "${SKIP_KONG:-0}" != "1" ]]; then
  log "1. Cài Kong Ingress Controller (Helm chart kong/ingress) — proxy NodePort 30080"
  helm repo add kong https://charts.konghq.com >/dev/null 2>&1 || true
  helm repo update kong >/dev/null
  helm upgrade --install kong kong/ingress -n kong --create-namespace \
    --set gateway.proxy.type=NodePort \
    --set gateway.proxy.http.nodePort=30080 \
    --set gateway.proxy.tls.nodePort=30443 \
    --set gateway.proxy.externalTrafficPolicy=Local \
    --wait --timeout 10m
  # externalTrafficPolicy=Local: giữ IP thật của người dùng để rate limit đúng từng IP
fi
kubectl -n kong get pods,svc

log "2. Namespace + Secret (chỉ tạo nếu chưa có — không ghi đè mật khẩu cũ)"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
if ! kubectl -n "$NS" get secret platform-secrets >/dev/null 2>&1; then
  kubectl -n "$NS" create secret generic platform-secrets \
    --from-literal=postgres-password="$(openssl rand -hex 24)" \
    --from-literal=keycloak-admin=admin \
    --from-literal=keycloak-admin-password="$(openssl rand -hex 16)"
  echo "Đã tạo secret platform-secrets (mật khẩu ngẫu nhiên)."
fi

PULL_ARGS=()
if [[ -n "${GHCR_USER:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  kubectl -n "$NS" create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io --docker-username="$GHCR_USER" --docker-password="$GHCR_TOKEN" \
    --dry-run=client -o yaml | kubectl apply -f -
  PULL_ARGS=(--set "imagePullSecrets[0].name=ghcr-pull")
fi

log "3. Deploy chart (image tag: $IMAGE_TAG)"
helm upgrade --install "$RELEASE" "$ROOT/helm/personal-web" -n "$NS" \
  -f "$ROOT/helm/personal-web/values-lab.yaml" \
  --set-string global.externalUrl="$URL" \
  --set-string ingress.host="$HOST" \
  --set-string frontend.image.tag="$IMAGE_TAG" \
  --set-string backend.image.tag="$IMAGE_TAG" \
  ${PULL_ARGS[@]+"${PULL_ARGS[@]}"} \
  --atomic --wait --timeout 15m

log "4. Kiểm tra"
sleep 5
echo "--- Truy cập trang chủ"
curl -s -o /dev/null -w "GET / -> %{http_code}\n" "$URL/"
echo "--- Request đi qua Kong (header Via / X-Request-ID / RateLimit)"
curl -sI -H "X-Request-ID: lab-check-001" "$URL/api/profile" | grep -iE "^HTTP|^via|x-request-id|ratelimit-limit|x-kong-upstream" || true
echo "--- Health readiness"
curl -s "$URL/api/health/ready"; echo
echo "--- Rate limit form liên hệ (7 lần, mong đợi 201 x5 rồi 429)"
for _ in $(seq 1 7); do
  curl -s -o /dev/null -w "%{http_code} " -X POST -H "Content-Type: application/json" \
    -d '{"name":"Lab Check","email":"lab@example.com","subject":"K8s rate limit","message":"Testing Kong rate limit on Kubernetes"}' \
    "$URL/api/contact"
done
echo

cat <<EOF

================================ KẾT QUẢ (copy gửi lại) ================================
EOF
kubectl -n "$NS" get pods,svc,ingress,hpa -o wide
kubectl -n "$NS" get kongplugins
helm -n "$NS" history "$RELEASE" --max 3
echo "URL: $URL"
echo "=========================================================================================="
