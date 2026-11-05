# Deploy production lên VPS

Hướng dẫn đưa `personal-web-platform` lên một VPS Ubuntu với tên miền thật và HTTPS.
Đã test bản production trên máy local (DOMAIN=localhost): toàn bộ luồng đăng nhập, API, email, rate limit đều chạy.

## Kiến trúc production

```text
Internet ──443/80──► Caddy (HTTPS tự động, Let's Encrypt)
                       │  chặn /auth/admin, /auth/realms/master
                       ▼
                     frontend (nginx: HTML/CSS/JS + reverse proxy, rate limit form)
                       ├── /api/*  ──► backend (FastAPI) ──► PostgreSQL (db portfolio, user portfolio)
                       │                  └──► Redis ──► worker (Celery) ──► SMTP thật (Gmail/Brevo...)
                       └── /auth/* ──► keycloak (start --optimized) ──► PostgreSQL (db keycloak, user keycloak)

Cổng mở ra Internet: 22 (SSH), 80, 443 — không gì khác.
Keycloak admin: 127.0.0.1:8080 trên VPS, chỉ vào được qua SSH tunnel.
```

| | Dev (`docker-compose.yml`) | Prod (`docker-compose.prod.yml`) |
|---|---|---|
| HTTPS | Không | Caddy + Let's Encrypt, HSTS, HTTP/3 |
| Keycloak | `start-dev`, ~1.6 GB RAM lúc khởi động | `start --optimized`, ~450–550 MB, khởi động ~25 giây |
| Mật khẩu | Mặc định trong file | Bắt buộc từ `.env.prod`, thiếu là không chạy |
| User test `hai`/`demo` | Có | Chỉ 1 admin lấy từ `.env.prod`; tắt đăng ký và password grant |
| Database | 1 superuser dùng chung | Mỗi service 1 user riêng, không truy cập chéo |
| Email | Mailpit | SMTP thật (STARTTLS + đăng nhập) |
| Cổng publish | 3000, 8000, 8025 | Chỉ 80/443 (Caddy) |
| Swagger `/docs` | Có | Tắt |
| Khác | | Giới hạn RAM từng service, xoay vòng log, chống brute-force đăng nhập, rate limit form 5 lần/phút/IP |

RAM đo được khi chạy: tổng khoảng **1.2 GB**, giới hạn tối đa cộng lại 2.2 GB, nên **VPS 4 GB là thoải mái**.

---

## Bước 1: Tên miền và DNS

Trên Cloudflare (hoặc nơi quản lý DNS), thêm 2 bản ghi:

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | IP VPS | DNS only (mây xám) |
| A | `www` | IP VPS | DNS only |

Để **DNS only** (mây xám) khi deploy lần đầu để Caddy xin được chứng chỉ. Sau khi HTTPS đã chạy, có thể bật proxy (mây cam) và chọn SSL mode **Full (strict)**.

Kiểm tra từ máy bạn (phải ra IP VPS):

```bash
nslookup tenmien.com
```

## Bước 2: Cài đặt VPS (một lần)

Tạo VPS Ubuntu 24.04, **dán SSH public key lúc tạo máy**, rồi từ máy bạn:

```bash
scp scripts/vps_bootstrap.sh root@IP_VPS:/root/
```

```bash
ssh root@IP_VPS "DEPLOY_USER=hai bash /root/vps_bootstrap.sh"
```

Script sẽ tạo user `hai`, khóa SSH (không cho root, không cho mật khẩu), bật UFW (chỉ mở 22/80/443), fail2ban, swap 2 GB và cài Docker.

⚠️ **Mở terminal mới và thử `ssh hai@IP_VPS` thành công rồi mới đóng phiên root.**

## Bước 3: Đưa code lên và tạo `.env.prod`

```bash
ssh hai@IP_VPS
```

```bash
git clone https://github.com/huuhai28/web-platform.git ~/personal-web-platform && cd ~/personal-web-platform
```

```bash
sh scripts/gen_prod_env.sh > .env.prod && chmod 600 .env.prod
```

```bash
nano .env.prod
```

Script đã sinh sẵn mật khẩu ngẫu nhiên. Bạn chỉ cần sửa:
- `DOMAIN`, `ACME_EMAIL`
- `PORTFOLIO_ADMIN_USERNAME`, `PORTFOLIO_ADMIN_EMAIL`. Mật khẩu đăng nhập website nằm ở `PORTFOLIO_ADMIN_PASSWORD`, nên lưu vào trình quản lý mật khẩu.
- Nhóm `SMTP_*`. Nếu dùng Gmail: bật xác minh 2 bước, tạo **App Password** tại myaccount.google.com/apppasswords rồi dán vào `SMTP_PASSWORD`.

> `.env.prod` chứa toàn bộ bí mật: **không commit**, không gửi qua chat. File đã có trong `.gitignore`.

## Bước 4: Chạy

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Lần đầu mất khoảng 3–5 phút để build image, Keycloak import realm và Caddy xin chứng chỉ. Theo dõi Caddy xin chứng chỉ:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f caddy
```

Thấy `certificate obtained successfully` là xong. Mở `https://tenmien.com` và bấm **Đăng nhập** bằng tài khoản admin trong `.env.prod`.

> Mẹo: tạo alias cho đỡ gõ: `echo "alias dcp='docker compose -f docker-compose.prod.yml --env-file .env.prod'" >> ~/.bashrc`

## Bước 5: Kiểm tra sau khi deploy

```bash
curl -I https://tenmien.com
```

```bash
curl https://tenmien.com/api/health
```

Kết quả mong đợi: `HTTP/2 200`, có header `strict-transport-security`, và health trả về `"environment":"production"`. Các đường dẫn sau phải trả **404** khi gọi từ Internet: `/auth/admin/`, `/auth/realms/master/...`, `/auth/health/ready`.

---

## Vận hành

### Vào trang quản trị Keycloak (qua SSH tunnel)

Trang admin bị chặn trên Internet. Từ máy bạn, mở tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 hai@IP_VPS
```

Rồi mở http://localhost:8080/auth/admin/ và đăng nhập bằng `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`.

### Cập nhật code mới

```bash
cd ~/personal-web-platform && git pull
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

```bash
docker image prune -f
```

### Deploy tự động bằng GitHub Actions

Sau khi VPS đã chạy được bằng tay (Bước 1–4):

1. Tạo SSH key riêng cho CI và cài lên VPS (giống bước 1 của phần GitLab bên dưới):

   ```bash
   ssh-keygen -t ed25519 -f ci_deploy -C "github-actions" -N ""
   ```

   ```bash
   ssh-copy-id -i ci_deploy.pub hai@IP_VPS
   ```

2. GitHub repo → **Settings → Secrets and variables → Actions**:

   | Tab | Name | Value |
   |---|---|---|
   | Secrets | `SSH_PRIVATE_KEY` | toàn bộ nội dung file `ci_deploy` |
   | Secrets | `SSH_KNOWN_HOSTS` | kết quả `ssh-keyscan IP_VPS` |
   | Secrets | `DEPLOY_HOST` | IP VPS |
   | Secrets | `DEPLOY_USER` | `hai` |
   | Secrets | `DEPLOY_PATH` | `/home/hai/personal-web-platform` |
   | Variables | `PUBLIC_URL` | `https://tenmien.com` |
   | Variables | `AUTO_DEPLOY` *(tùy chọn)* | `true` |

3. **Deploy:** tab **Actions → CI/CD → Run workflow**, tick `deploy`. Đặt `AUTO_DEPLOY=true` thì
   mỗi lần push `main` sẽ tự deploy. **Rollback:** Run workflow, điền `rollback_tag` = SHA 7 ký tự cũ
   (xem file `.deployed-tag` trên VPS hoặc tab Packages).
4. Image nằm ở tab **Packages** của repo (GHCR). VPS pull bằng token tạm của job nên package để private vẫn được.

### Deploy tự động bằng GitLab CI/CD

Nếu dùng GitLab thay vì GitHub:

1. **Tạo SSH key riêng cho CI** (trên máy bạn, không đặt passphrase):

   ```bash
   ssh-keygen -t ed25519 -f ci_deploy -C "gitlab-ci" -N ""
   ```

   ```bash
   ssh-copy-id -i ci_deploy.pub hai@IP_VPS
   ```

2. Vào GitLab → **Settings → CI/CD → Variables** và thêm:

   | Key | Value | Type / cờ |
   |---|---|---|
   | `SSH_PRIVATE_KEY` | nội dung file `ci_deploy` | **File**, Protected |
   | `SSH_KNOWN_HOSTS` | kết quả `ssh-keyscan IP_VPS` | Variable |
   | `DEPLOY_HOST` | IP VPS | Variable |
   | `DEPLOY_USER` | `hai` | Variable |
   | `DEPLOY_PATH` | `/home/hai/personal-web-platform` | Variable |
   | `PUBLIC_URL` | `https://tenmien.com` | Variable |
   | `AUTO_DEPLOY` *(tùy chọn)* | `true` | Variable |

   Sau đó xóa file `ci_deploy` trên máy (hoặc cất vào trình quản lý mật khẩu).

3. Push lên nhánh `main` → pipeline build image, push lên GitLab Container Registry → bấm ▶ job
   `deploy:vps` (hoặc tự chạy nếu `AUTO_DEPLOY=true`). Job sẽ pull đúng image theo commit SHA, chạy
   `docker compose up -d --no-build` rồi gọi `/api/health` để xác nhận.
4. **Rollback:** Run pipeline trên `main` với biến `ROLLBACK_TAG=<sha cũ>` rồi bấm job `rollback:vps`.
   Tag đang chạy được ghi trong file `.deployed-tag` trên VPS.

> Từ lúc dùng CI, VPS **không build image** nữa (đỡ tốn RAM/CPU). `.env.prod` vẫn chỉ nằm trên VPS.

### Backup database

```bash
bash scripts/backup_db.sh
```

Backup tự động lúc 2h sáng mỗi ngày, chạy `crontab -e` rồi thêm dòng:

```text
0 2 * * * cd ~/personal-web-platform && bash scripts/backup_db.sh >> ~/backups/backup.log 2>&1
```

Nên copy thư mục `~/backups` ra ngoài VPS định kỳ (máy bạn, S3, Google Drive), vì VPS hỏng thì backup nằm trên đó cũng mất.

### Lưu ý về realm Keycloak

`realm-export.prod.json` **chỉ được import lần đầu** (khi database Keycloak còn trống). Sau đó, mọi thay đổi như đổi mật khẩu, thêm user hay đổi tên miền phải làm trong trang quản trị Keycloak. Nếu đổi `DOMAIN`, nhớ sửa *Valid redirect URIs*, *Web origins* và *Post logout redirect URIs* của client `portfolio-frontend`.

---

## Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| Caddy log `challenge failed` / không có HTTPS | DNS chưa trỏ đúng IP, đang bật mây cam Cloudflare, hoặc firewall nhà cung cấp VPS chặn 80/443. Kiểm tra bằng `nslookup`, tắt proxy Cloudflare, mở cổng trong security group. |
| Lỗi `required variable ... is missing` | Thiếu biến trong `.env.prod`. Bản prod cố tình không có giá trị mặc định cho bí mật. |
| Đăng nhập báo *Invalid parameter: redirect_uri* | `DOMAIN` khác với lúc import realm lần đầu. Sửa redirect URI trong Keycloak admin (xem phần trên). |
| Keycloak restart liên tục, `docker stats` sát 1 GiB | Tăng `memory` của keycloak trong compose (ví dụ 1536M) hoặc nâng VPS. |
| Form liên hệ báo lỗi 429 | Rate limit đang hoạt động (5 lần/phút/IP). Đợi 1 phút. |
| Không nhận được email | Xem `docker compose ... logs worker`. Thường do sai App Password, hoặc chưa đặt `SMTP_STARTTLS=true` với cổng 587. |
| Sau khi đổi mật khẩu DB trong `.env.prod` thì không kết nối được | Mật khẩu DB chỉ được tạo lần đầu. Đổi trực tiếp trong PostgreSQL bằng `ALTER ROLE ... PASSWORD`, hoặc xóa volume nếu chưa có dữ liệu thật. |
