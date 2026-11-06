#!/usr/bin/env bash
# =============================================================================
# TẮT (xóa hẳn) toàn bộ hệ thống trên AWS để không bị trừ tiền/credit (~2–3 phút).
# Xóa: 2 EC2 (kèm ổ đĩa), VPC, subnet, Security Group, key pair. Code trong Git KHÔNG bị ảnh hưởng —
# bật lại bằng: bash scripts/aws-up.sh
#
# Chạy trong Git Bash, tại thư mục repo:
#   bash scripts/aws-down.sh          # hỏi xác nhận
#   bash scripts/aws-down.sh --yes    # không hỏi
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

docker info >/dev/null 2>&1 || { echo "Docker Desktop chưa chạy — mở Docker Desktop rồi chạy lại."; exit 1; }

echo "Tài nguyên đang chạy trên AWS (theo Terraform):"
bash terraform/tf.sh state list 2>/dev/null | grep -E "aws_instance|aws_vpc\." || echo "  (không có — có thể đã tắt rồi)"

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Xóa toàn bộ các tài nguyên trên? Gõ 'yes' để xác nhận: " answer
  [[ "$answer" == "yes" ]] || { echo "Đã hủy, không xóa gì."; exit 0; }
fi

bash terraform/tf.sh destroy -input=false -auto-approve
rm -f ansible/artifacts/kubeconfig

echo
echo "Đã tắt xong. Kiểm tra lại (phải ra danh sách trống):"
aws ec2 describe-instances \
  --filters "Name=tag:Project,Values=personal-web" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query "Reservations[].Instances[].[InstanceId,State.Name]" --output text
echo "(trống = không còn máy nào của project)"
