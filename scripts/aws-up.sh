#!/usr/bin/env bash
# =============================================================================
# BẬT toàn bộ hệ thống trên AWS bằng 1 lệnh (khoảng 20–25 phút):
#   1. Terraform tạo VPC + 2 EC2              (terraform/tf.sh apply)
#   2. Ansible dựng cluster kubeadm            (ansible/run.sh)
#   3. Helm deploy Kong + monitoring + app     (scripts/k8s-lab-deploy.sh, chạy trên control plane)
#
# Chạy trong Git Bash (VS Code: Terminal → New Terminal → chọn "Git Bash"), tại thư mục repo:
#   bash scripts/aws-up.sh
#
# Yêu cầu: Docker Desktop đang chạy, đã `aws configure`, có terraform/terraform.tfvars.
# Biến: SSH_KEY (mặc định ~/.ssh/aws-personal-web), IMAGE_TAG (mặc định latest).
# Tắt bằng: bash scripts/aws-down.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/aws-personal-web}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)

step() { printf '\n\033[1;32m############ %s ############\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*"; exit 1; }

step "0/3 Kiểm tra trước khi chạy"
docker info >/dev/null 2>&1 || die "Docker Desktop chưa chạy — mở Docker Desktop rồi chạy lại."
aws sts get-caller-identity >/dev/null 2>&1 || die "AWS chưa đăng nhập — chạy: aws configure"
[[ -f terraform/terraform.tfvars ]] || die "Thiếu terraform/terraform.tfvars — copy từ terraform/terraform.tfvars.example"
[[ -f "$SSH_KEY" ]] || die "Không thấy SSH key $SSH_KEY"

# IP nhà bạn có thể đổi sau mỗi lần modem khởi động lại → cập nhật để SSH/Grafana vẫn vào được
MYIP="$(curl -s --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')"
if [[ -n "$MYIP" ]] && ! grep -q "\"$MYIP/32\"" terraform/terraform.tfvars; then
  sed -i "s#^my_ip_cidr *=.*#my_ip_cidr = \"$MYIP/32\"#" terraform/terraform.tfvars
  echo "Đã cập nhật my_ip_cidr = $MYIP/32"
fi

step "1/3 Terraform: tạo hạ tầng AWS (~2 phút)"
bash terraform/tf.sh init -input=false >/dev/null
bash terraform/tf.sh apply -input=false -auto-approve
CP_IP="$(bash terraform/tf.sh output -raw control_plane_public_ip | tr -d '\r')"
echo "Control plane: $CP_IP"

echo "Chờ các máy mở cổng SSH..."
for ip in $(grep -oE 'ansible_host=[0-9.]+' ansible/inventory/aws.ini | cut -d= -f2); do
  for _ in $(seq 1 40); do (exec 3<>"/dev/tcp/$ip/22") 2>/dev/null && break; sleep 5; done
done

step "2/3 Ansible: dựng cluster kubeadm (~6–8 phút)"
SSH_KEY="$SSH_KEY" bash ansible/run.sh

step "3/3 Helm: Kong Ingress + Prometheus/Grafana + app (~10–12 phút)"
# Chạy trên control plane (đã có kubectl + helm do Ansible cài)
ssh "${SSH_OPTS[@]}" "ubuntu@$CP_IP" "set -e
  rm -rf web-platform && git clone -q https://github.com/huuhai28/web-platform.git && cd web-platform
  NODE_IP=$CP_IP IMAGE_TAG=$IMAGE_TAG INSTALL_MONITORING=1 bash scripts/k8s-lab-deploy.sh"

cat <<EOF

============================== ĐÃ BẬT XONG ==============================
Website : http://personal-web.$CP_IP.nip.io:30080
Swagger : http://personal-web.$CP_IP.nip.io:30080/api-docs/
Grafana : http://$CP_IP:30300   (user admin; mật khẩu in ở bước 3 phía trên)
SSH     : ssh -i $SSH_KEY ubuntu@$CP_IP
kubectl : ssh vào control plane rồi gõ kubectl get pods -A

ĐANG TÍNH PHÍ ~0,2 USD/giờ (trừ credit). Dùng xong nhớ tắt:  bash scripts/aws-down.sh
==========================================================================
EOF
