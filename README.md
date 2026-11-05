# Personal Web Platform

<!-- Thay <github-user> và <tenmien> sau khi tạo repo / deploy -->
[![CI/CD](https://github.com/<github-user>/personal-web-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/<github-user>/personal-web-platform/actions/workflows/ci.yml)

**Live:** https://&lt;tenmien&gt; · English: https://&lt;tenmien&gt;/?lang=en

> **EN —** A bilingual (VI/EN) portfolio site that is also a hands-on DevOps project: a static Nginx
> frontend, FastAPI + Celery backend, Keycloak (OIDC/PKCE), PostgreSQL and Redis — packaged with
> Docker, deployed to a VPS behind Caddy (automatic HTTPS) by a GitLab CI/CD pipeline, with a Helm
> chart for Kubernetes.

Website giới thiệu bản thân, đồng thời là project tổng hợp kỹ năng DevOps: từ container, reverse proxy,
xác thực OIDC, hàng đợi bất đồng bộ đến CI/CD, HTTPS, hardening VPS và Kubernetes/Helm.

---

## Project này thể hiện gì

| Mảng | Đã làm |
|---|---|
| **Container** | 7 service bằng Docker Compose; image nhỏ (frontend 74 MB); backend chạy user thường; healthcheck, giới hạn RAM, xoay vòng log |
| **CI/CD** | Cùng một pipeline viết cho **GitHub Actions** và **GitLab CI**: validate (compose, Helm, kubeconform) → test (pytest, kiểm tra JS/bản dịch) → build 3 image song song → Trivy scan → deploy qua SSH (bấm tay hoặc tự động), có rollback theo commit SHA |
| **Kubernetes** | Helm chart (Deployment, StatefulSet + PVC, Service, ConfigMap, Secret có sẵn) + manifest Kustomize; job `deploy:k8s` dùng `helm upgrade --atomic` |
| **Networking / TLS** | Caddy tự cấp HTTPS Let's Encrypt, HSTS, HTTP/3; Nginx reverse proxy `/api`, `/auth`, lấy IP thật sau proxy |
| **Identity** | Keycloak OIDC Authorization Code + **PKCE tự viết bằng JS thuần**, phân quyền theo realm role, chống brute-force |
| **Security** | CSP chặt (không inline script/style), chặn trang admin Keycloak ra Internet (vào qua SSH tunnel), user DB riêng từng service, rate limit form, không có mật khẩu mặc định ở production, UFW + fail2ban |
| **Async** | Form liên hệ → PostgreSQL → Redis → Celery worker → SMTP |
| **Vận hành** | Script cài VPS 1 lệnh, backup DB tự động giữ 14 bản, tài liệu deploy + xử lý sự cố |
| **Frontend** | HTML/CSS/JS thuần, không build step; song ngữ Việt/Anh; responsive; hiệu ứng cuộn |

## Kiến trúc

```text
                         ┌──────────────── VPS (Docker Compose) ────────────────┐
Internet ──80/443──► Caddy ──► frontend (nginx) ──┬─ /        HTML/CSS/JS tĩnh (VI/EN)
        HTTPS tự động        rate limit, CSP      ├─ /api/*  ─► backend (FastAPI) ─► PostgreSQL
        chặn /auth/admin                          │               └─► Redis ─► worker (Celery) ─► SMTP
                                                  └─ /auth/* ─► Keycloak (OIDC) ─► PostgreSQL
                         └──────────────────────────────────────────────────────┘
                              Keycloak admin: 127.0.0.1:8080 (chỉ qua SSH tunnel)

GitHub ──push──► Actions: validate → test → build ─► GHCR ──pull (tag = commit SHA)──► VPS
                                            └─► scan (Trivy)
(GitLab CI tương đương: GitLab Registry, thêm job helm upgrade ──► Kubernetes)
```

| Service | Công nghệ | Vai trò |
|---|---|---|
| `caddy` *(prod)* | Caddy 2 | Cổng duy nhất ra Internet, HTTPS tự động |
| `frontend` | Nginx, HTML/CSS/JS | Trang web song ngữ + reverse proxy |
| `backend` | Python 3.13, FastAPI, SQLAlchemy | API, kiểm tra JWT của Keycloak |
| `worker` | Celery | Gửi email thông báo ngoài request chính |
| `keycloak` | Keycloak 26 | Đăng nhập OIDC, phân quyền |
| `postgres` | PostgreSQL 17 | 2 database tách biệt: `portfolio`, `keycloak` |
| `redis` | Redis 7 | Message broker |
| `mailpit` *(dev)* | Mailpit | Hộp thư thử nghiệm |

## Chạy thử trên máy

Yêu cầu: Docker Desktop; cổng `3000`, `8000`, `8025` còn trống.

```bash
docker compose up --build -d
```

| URL | |
|---|---|
| http://localhost:3000 | Trang web (thêm `?lang=en` cho tiếng Anh) |
| http://localhost:3000/#admin | Đăng nhập quản trị — user `hai` / `ChangeMe123!` (chỉ dùng local) |
| http://localhost:8025 | Mailpit — xem email từ form liên hệ |
| http://localhost:8000/docs | Swagger API (tắt ở production) |

Chỉ sửa giao diện, không cần Docker: `node scripts/dev_static_server.mjs` → http://localhost:5500.

## Test

```bash
# Backend: 7 test API (SQLite, không cần container)
cd backend && pip install -r requirements-dev.txt && pytest -v

# Frontend: cú pháp JS + đủ bản dịch vi/en
node scripts/check_frontend.mjs

# End-to-end trên stack đang chạy: 14 bước (HTML, Keycloak, đăng nhập, phân quyền, form, admin)
python scripts/full_function_test.py --client-id portfolio-frontend --user demo --admin-user hai
```

Đã kiểm chứng: 14/14 bước E2E trên bản dev; 12/12 bước E2E trên bản production chạy local với HTTPS
(PKCE, refresh token, thu hồi phiên khi dùng lại authorization code, rate limit 429, trang admin bị chặn);
deploy giả lập pull image theo tag từ registry. Kịch bản load test 1000 user: [docs/TESTING.md](docs/TESTING.md).

## Production

Toàn bộ quy trình — thuê VPS, trỏ DNS, cài đặt bảo mật, HTTPS, backup — trong **[docs/DEPLOY.md](docs/DEPLOY.md)**.

```bash
sh scripts/gen_prod_env.sh > .env.prod && chmod 600 .env.prod   # sinh mật khẩu ngẫu nhiên, sửa DOMAIN/SMTP
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

RAM thực tế ~1.2 GB cho cả stack (Keycloak build sẵn cấu hình: ~450 MB, khởi động ~25 giây) → VPS 2 vCPU / 4 GB.

## CI/CD

Pipeline chính chạy trên **GitHub Actions** ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
Bản tương đương cho **GitLab CI** ([.gitlab-ci.yml](.gitlab-ci.yml)) dùng GitLab Registry và có thêm job `deploy:k8s` (Helm).

| Giai đoạn | Việc làm | Chạy khi |
|---|---|---|
| validate | `docker compose config` (dev + prod), `helm lint` + `template`, kubeconform | Mọi push và PR |
| test | pytest backend, kiểm tra JS + bản dịch frontend | Mọi push và PR |
| build | 3 image song song (frontend, backend, keycloak) → GHCR, tag = commit SHA + `latest`, cache build | Push `main` |
| scan | Trivy — lỗ hổng HIGH/CRITICAL (báo cáo, không chặn) | Sau build |
| deploy | SSH → chép cấu hình → pull image theo SHA → `compose up --no-build` → health check HTTPS | Bấm *Run workflow*, hoặc tự động nếu `AUTO_DEPLOY=true` |
| rollback | Như deploy nhưng dùng tag cũ | *Run workflow* với `rollback_tag` |

Cấu hình (Settings → Secrets and variables → Actions) — **Secrets:** `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`,
`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`; **Variables:** `PUBLIC_URL`, `AUTO_DEPLOY`.
File `.env.prod` (bí mật) chỉ nằm trên VPS, pipeline không bao giờ đọc hay chép nó.

## Kubernetes

```bash
helm upgrade --install personal-web ./helm/personal-web -n personal-web --create-namespace \
  --set-string global.externalUrl=http://<node-ip>:30777 --set frontend.service.nodePort=30777 \
  --set-string backend.config.contactReceiverEmail=you@example.com
```

Hướng dẫn đầy đủ (tạo Secret, đổi image, rollback): [helm/personal-web/README.md](helm/personal-web/README.md).
Manifest thuần (Kustomize) cho Minikube: `kubectl apply -k k8s/base`.

## Ghi chú kỹ thuật — những vấn đề đã gặp

- **Keycloak tạo URL mất cổng** (`localhost:3000` → `localhost`): Nginx gửi `X-Forwarded-Port: $server_port`
  là cổng *bên trong* container (80). Bỏ header này vì cổng đã có trong `Host`.
- **Keycloak ngốn 1.6 GB RAM lúc khởi động** ở `start-dev` do Quarkus build lại cấu hình mỗi lần chạy.
  Image riêng chạy `kc.sh build` một lần → `start --optimized`: ~450 MB, khởi động nhanh gấp đôi.
- **CSP chặn `style=""` sinh bằng JS**: thanh kỹ năng gán `--level` qua CSSOM (`style.setProperty`) thay vì chuỗi HTML.
- **Đứng sau Caddy, Nginx thấy mọi request là `http`**: dùng `map` giữ `X-Forwarded-Proto` từ Caddy, nếu không
  Keycloak tạo redirect `http://` trên site HTTPS.
- **Docker bỏ qua UFW** với cổng publish ra `0.0.0.0`: production chỉ publish 80/443, Keycloak admin bind `127.0.0.1`.
- **Dùng lại authorization code** → Keycloak thu hồi cả refresh token của phiên đó (đúng chuẩn OAuth 2.0).

## Cấu trúc thư mục

```text
personal-web-platform/
├── frontend/
│   ├── site/                  # HTML/CSS/JS thuần
│   │   ├── js/i18n.js         #   câu chữ giao diện vi/en
│   │   ├── js/data.js         #   nội dung: profile, kỹ năng, dự án (vi/en)
│   │   ├── js/auth.js         #   OIDC + PKCE không thư viện
│   │   └── js/app.js          #   render, form, khu vực admin
│   ├── nginx/default.conf     # reverse proxy, header bảo mật, rate limit
│   └── Dockerfile
├── backend/                   # FastAPI + Celery, tests/ (pytest)
├── infra/
│   ├── caddy/Caddyfile        # HTTPS, chặn đường dẫn admin
│   ├── keycloak/              # Dockerfile (optimized) + realm dev/prod
│   └── postgres/              # script tạo DB/user
├── helm/personal-web/         # Helm chart
├── k8s/base/                  # Kustomize manifests
├── scripts/                   # cài VPS, sinh env, backup, test E2E/load test
├── docs/DEPLOY.md, TESTING.md
├── docker-compose.yml         # dev
├── docker-compose.prod.yml    # production
├── .github/workflows/ci.yml   # GitHub Actions
└── .gitlab-ci.yml             # GitLab CI (tương đương)
```

## Hướng phát triển

- Monitoring: Uptime Kuma (trang status công khai) hoặc Prometheus + Grafana + cảnh báo Telegram.
- Đưa backup ra ngoài VPS (S3 / Google Drive) và diễn tập khôi phục định kỳ.
- Blog kỹ thuật viết bằng Markdown; trang CV tải xuống.
- Kubernetes: Ingress + cert-manager, NetworkPolicy, HPA, GitOps với Argo CD.
