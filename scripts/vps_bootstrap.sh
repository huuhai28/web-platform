#!/usr/bin/env bash
# =============================================================================
# Cài đặt VPS Ubuntu 22.04/24.04 mới cho personal-web-platform. Chạy bằng root, MỘT LẦN:
#   curl -fsSLO <raw-url>/scripts/vps_bootstrap.sh   (hoặc scp file lên)
#   sudo DEPLOY_USER=hai bash vps_bootstrap.sh
#
# Script sẽ:
#   1. Cập nhật hệ thống, bật tự động cập nhật bảo mật
#   2. Tạo user deploy (sudo + docker), copy SSH key từ root
#   3. Tắt đăng nhập root và đăng nhập bằng mật khẩu qua SSH
#   4. Firewall UFW: chỉ mở 22, 80, 443 (+443/udp cho HTTP/3)
#   5. Fail2ban chống dò mật khẩu SSH
#   6. Swap 2 GB (Keycloak cần RAM lúc khởi động)
#   7. Cài Docker Engine + Compose plugin
#
# CẢNH BÁO: trước khi đóng phiên root, mở terminal MỚI và thử `ssh $DEPLOY_USER@<ip>`.
# =============================================================================
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

if [[ $EUID -ne 0 ]]; then echo "Hãy chạy bằng root (sudo)." >&2; exit 1; fi
if [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "Không thấy /root/.ssh/authorized_keys — thêm SSH key trước, nếu không sẽ tự khóa mình ở ngoài." >&2
  exit 1
fi

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "1. Cập nhật hệ thống"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades openssl htop
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Asia/Ho_Chi_Minh || true

log "2. Tạo user ${DEPLOY_USER}"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
# sudo không cần mật khẩu (user không có mật khẩu, chỉ đăng nhập bằng key)
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"

log "3. Khóa SSH: không root, không mật khẩu"
cat > /etc/ssh/sshd_config.d/90-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
sshd -t
systemctl reload ssh || systemctl reload sshd

log "4. Firewall UFW"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

log "5. Fail2ban"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

log "6. Swap ${SWAP_SIZE}"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
  sysctl -p /etc/sysctl.d/99-swappiness.conf
fi

log "7. Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

# Lưu ý: Docker tự thêm rule iptables và BỎ QUA UFW với các cổng publish ra 0.0.0.0.
# Vì vậy docker-compose.prod.yml chỉ publish 80/443 (Caddy) và 8080 trên 127.0.0.1.

log "Xong!"
cat <<EOF

Bước tiếp theo:
  1. Mở terminal MỚI:   ssh ${DEPLOY_USER}@$(hostname -I | awk '{print $1}')
  2. Clone project:     git clone <repo-url> ~/personal-web-platform
  3. Tạo env:           cd ~/personal-web-platform && sh scripts/gen_prod_env.sh > .env.prod && chmod 600 .env.prod && nano .env.prod
  4. Chạy:              docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
EOF
