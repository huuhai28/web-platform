#!/usr/bin/env bash
# Chạy Terraform trong Docker (không cần cài Terraform; chạy được trên Windows Git Bash).
# Dùng credential AWS trong ~/.aws (tạo bằng `aws configure`) và public key trong ~/.ssh.
#
#   bash terraform/tf.sh init
#   bash terraform/tf.sh plan
#   bash terraform/tf.sh apply
#   bash terraform/tf.sh output
#   bash terraform/tf.sh destroy      ← nhớ chạy sau mỗi buổi học để không tốn tiền
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
win_path() { (cd "$1" && pwd -W 2>/dev/null) || (cd "$1" && pwd); }

[[ -d "$HOME/.aws" ]] || { echo "Chưa có ~/.aws — chạy: aws configure"; exit 1; }

ENV_ARGS=()
for v in AWS_PROFILE AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN; do
  [[ -n "${!v:-}" ]] && ENV_ARGS+=(-e "$v")
done

MSYS_NO_PATHCONV=1 docker run --rm -it \
  -v "$(win_path "$ROOT"):/work" \
  -v "$(win_path "$HOME/.aws"):/root/.aws:ro" \
  -v "$(win_path "$HOME/.ssh"):/root/.ssh:ro" \
  ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} \
  -w /work/terraform \
  hashicorp/terraform:1.9.8 "$@"
