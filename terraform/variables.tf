variable "region" {
  description = "AWS region (ap-southeast-1 = Singapore, gần Việt Nam)"
  type        = string
  default     = "ap-southeast-1"
}

variable "project" {
  description = "Tiền tố đặt tên và tag cho mọi tài nguyên"
  type        = string
  default     = "personal-web"
}

variable "my_ip_cidr" {
  description = "IP của bạn dạng CIDR, vd 1.2.3.4/32 (lấy bằng: curl -s https://checkip.amazonaws.com). Chỉ IP này được SSH và vào Grafana."
  type        = string

  validation {
    condition     = can(cidrhost(var.my_ip_cidr, 0)) && var.my_ip_cidr != "0.0.0.0/0"
    error_message = "my_ip_cidr phải là CIDR hợp lệ (vd 1.2.3.4/32) và không được mở cho cả Internet."
  }
}

variable "k8s_api_public" {
  description = "Mở Kubernetes API (6443) cho mọi IP để GitHub Actions deploy được (IP runner thay đổi liên tục). API vẫn yêu cầu client certificate. false = chỉ my_ip_cidr."
  type        = bool
  default     = false
}

variable "instance_type" {
  description = "Loại máy control plane (kubeadm cần tối thiểu 2 vCPU / 2 GB). Tài khoản Free Plan chỉ được dùng loại free-tier-eligible: c7i-flex.large (4 GB), m7i-flex.large (8 GB)..."
  type        = string
  default     = "c7i-flex.large"
}

variable "worker_instance_type" {
  description = "Loại máy worker — app (Keycloak ~1 GB) + Prometheus/Grafana chạy ở đây nên cần nhiều RAM hơn"
  type        = string
  default     = "m7i-flex.large"
}

variable "worker_count" {
  description = "Số worker node"
  type        = number
  default     = 1
}

variable "root_volume_gb" {
  description = "Dung lượng ổ gốc mỗi node (GB)"
  type        = number
  default     = 20
}

variable "ssh_public_key_path" {
  description = "Public key dùng để SSH vào node (Ansible dùng private key tương ứng)"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "budget_email" {
  description = "Email nhận cảnh báo chi phí. Để trống nếu đã tạo Budget bằng tay trên Console."
  type        = string
  default     = ""
}

variable "budget_limit_usd" {
  description = "Ngưỡng chi phí hằng tháng (USD)"
  type        = number
  default     = 10
}
