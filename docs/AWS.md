# End-to-end trên AWS: Terraform → Ansible (kubeadm) → Helm qua GitHub Actions → Prometheus/Grafana

```text
 ┌──────────── máy bạn ────────────┐            ┌──────────────────── AWS ap-southeast-1 ─────────────────────┐
 │ terraform/  (tf.sh, Docker)     │──apply────►│ VPC 10.10.0.0/16 · public subnet · IGW · Security Group     │
 │                                 │            │ EC2 t3.medium: personal-web-cp-1 (control plane)            │
 │ ansible/    (run.sh, Docker)    │──SSH──────►│ EC2 t3.medium: personal-web-worker-1                        │
 │   containerd, kubeadm init/join │            │   kubeadm · Flannel · metrics-server · local-path · Helm    │
 └─────────────┬───────────────────┘            └───────────────▲─────────────────────────────────────────────┘
               │ kubeconfig (secret KUBECONFIG_B64)              │ helm upgrade --install (6443)
               ▼                                                 │
 GitHub Actions: CI/CD (test → build → GHCR) ──► Deploy to Kubernetes ──┘
                                                   ├─ Kong Ingress Controller (NodePort 30080)
                                                   ├─ kube-prometheus-stack (Grafana NodePort 30300)
                                                   └─ chart personal-web (Ingress + KongPlugin, HPA, ServiceMonitor,
                                                      PrometheusRule, dashboard Grafana)
```

**Chi phí:** 2 × t3.medium (~0,052 USD/giờ mỗi máy ở Singapore) + 2 × 20 GB gp3 → khoảng **0,1–0,15 USD/giờ**.
Không dùng EKS (control plane tính phí theo giờ) và NAT Gateway. **Luôn `destroy` sau khi học xong.**

## 0. Chuẩn bị (một lần)

1. **Budget alert** — AWS Console → Budgets → *Create budget* → template *Monthly cost budget* → 10 USD → email của bạn.
2. **IAM user cho Terraform** — IAM → Users → *Create user* `terraform-lab` → *Attach policies directly*:
   `AmazonEC2FullAccess` → mở user → *Security credentials* → *Create access key* (CLI).
3. **Cấu hình trên máy**: `aws configure` (region `ap-southeast-1`). Kiểm tra: `aws sts get-caller-identity`.
4. **SSH key riêng**: `ssh-keygen -t ed25519 -f ~/.ssh/aws-personal-web -N ""`.
5. **tfvars**: `cp terraform/terraform.tfvars.example terraform/terraform.tfvars`, điền `my_ip_cidr`
   (`curl -s https://checkip.amazonaws.com` + `/32`), `ssh_public_key_path = "~/.ssh/aws-personal-web.pub"`,
   `k8s_api_public = true` nếu muốn deploy từ GitHub Actions.

Chỉ cần **Docker** — Terraform và Ansible đều chạy trong container qua `terraform/tf.sh` và `ansible/run.sh`.

## 1. Tạo hạ tầng — Terraform

```bash
bash terraform/tf.sh init
bash terraform/tf.sh plan      # xem trước: 1 VPC, 1 subnet, 1 IGW, 1 SG + rule, 1 key pair, 2 EC2
bash terraform/tf.sh apply
bash terraform/tf.sh output
```

Terraform tự sinh `ansible/inventory/aws.ini` từ IP thật của EC2.

## 2. Dựng cluster — Ansible + kubeadm

```bash
SSH_KEY=~/.ssh/aws-personal-web bash ansible/run.sh
```

Playbook [ansible/site.yml](../ansible/site.yml): tắt swap, kernel module + sysctl, containerd (systemd cgroup),
kubelet/kubeadm/kubectl (repo pkgs.k8s.io, giữ phiên bản), `kubeadm init` (SAN có IP public), Flannel,
`kubeadm join`, metrics-server, local-path-provisioner, Helm. Chạy lại an toàn (idempotent).
Kết quả: `ansible/artifacts/kubeconfig` (server = IP public control plane).

```bash
KUBECONFIG=ansible/artifacts/kubeconfig kubectl get nodes -o wide
```

## 3. Deploy — GitHub Actions (hoặc từ máy)

**Qua GitHub Actions** (đúng câu chuyện CI/CD):

1. Repo → Settings → Secrets and variables → Actions:
   - Secret `KUBECONFIG_B64` = kết quả `base64 -w0 ansible/artifacts/kubeconfig`
   - Secret `GRAFANA_ADMIN_PASSWORD` = mật khẩu bạn chọn
   - Variable `K8S_NODE_IP` = output `control_plane_public_ip`
   - *(tùy chọn)* Variable `K8S_AUTO_DEPLOY` = `true` → mỗi lần CI xanh trên `main` tự deploy
2. Actions → **Deploy to Kubernetes** → *Run workflow*.

**Hoặc từ máy bạn** (cần `kubectl` + `helm`):

```bash
KUBECONFIG=ansible/artifacts/kubeconfig NODE_IP=<control_plane_public_ip> INSTALL_MONITORING=1 \
  bash scripts/k8s-lab-deploy.sh
```

Script cài Kong Ingress Controller, kube-prometheus-stack, rồi chart `personal-web` với `values-lab.yaml`
(`--atomic`: lỗi thì tự rollback) và tự kiểm tra: header `Via: kong`, `/api/health/ready`, rate limit 429.

## 4. Xem kết quả

| | URL |
|---|---|
| Website (qua Kong Ingress) | `http://personal-web.<IP>.nip.io:30080` |
| Swagger | `http://personal-web.<IP>.nip.io:30080/api-docs/` |
| Grafana (chỉ IP của bạn) | `http://<IP>:30300` → dashboard *Personal Web Platform — Kubernetes* |

Ảnh nên chụp cho README: `kubectl get nodes,pods -A`, `kubectl -n personal-web get ingress,hpa,kongplugins`,
dashboard Grafana, run xanh của workflow *Deploy to Kubernetes*, `terraform output`.

## 5. Dọn dẹp (bắt buộc)

```bash
bash terraform/tf.sh destroy
```

Kiểm tra lại trên Console: EC2 → Instances không còn máy `personal-web-*` đang chạy.
