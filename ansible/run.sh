#!/usr/bin/env bash
# Chạy Ansible trong Docker (không cần cài Ansible trên máy, chạy được cả trên Windows Git Bash).
#
#   bash ansible/run.sh                       # dựng cluster theo inventory/aws.ini (Terraform sinh ra)
#   INVENTORY=inventory/lab.ini bash ansible/run.sh   # VM lab có sẵn
#   bash ansible/run.sh --check               # tham số thêm được chuyển thẳng cho ansible-playbook
#
# Biến: SSH_KEY (mặc định ~/.ssh/id_ed25519) — private key ứng với public key đã đưa cho Terraform.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
INVENTORY="${INVENTORY:-inventory/aws.ini}"
IMAGE=personal-web-ansible

[[ -f "$SSH_KEY" ]] || { echo "Không thấy private key $SSH_KEY (đặt biến SSH_KEY)"; exit 1; }
[[ -f "$ROOT/ansible/$INVENTORY" ]] || { echo "Không thấy ansible/$INVENTORY — chạy terraform apply trước"; exit 1; }

# Đường dẫn kiểu Windows cho docker khi chạy trong Git Bash
win_path() { (cd "$1" && pwd -W 2>/dev/null) || (cd "$1" && pwd); }
ROOT_MOUNT="$(win_path "$ROOT")"
KEY_DIR_MOUNT="$(win_path "$(dirname "$SSH_KEY")")"
KEY_NAME="$(basename "$SSH_KEY")"

docker build -q -t "$IMAGE" "$ROOT/ansible" >/dev/null

MSYS_NO_PATHCONV=1 docker run --rm -t \
  -v "$ROOT_MOUNT:/work" \
  -v "$KEY_DIR_MOUNT:/keys:ro" \
  -e ANSIBLE_PRIVATE_KEY_FILE=/root/.ssh/id_key \
  -e ANSIBLE_CONFIG=/work/ansible/ansible.cfg \
  "$IMAGE" sh -c "
    mkdir -p /root/.ssh && cp /keys/$KEY_NAME /root/.ssh/id_key && chmod 600 /root/.ssh/id_key &&
    ansible-playbook -i $INVENTORY site.yml $*
  "

echo
echo "Kubeconfig: ansible/artifacts/kubeconfig"
echo "Thử:        KUBECONFIG=ansible/artifacts/kubeconfig kubectl get nodes -o wide"
