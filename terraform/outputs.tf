output "control_plane_public_ip" {
  description = "IP public của control plane"
  value       = aws_instance.control_plane.public_ip
}

output "worker_public_ips" {
  description = "IP public của các worker"
  value       = aws_instance.worker[*].public_ip
}

output "website_url" {
  description = "Trang web qua Kong Ingress (sau khi deploy chart)"
  value       = "http://personal-web.${aws_instance.control_plane.public_ip}.nip.io:30080"
}

output "grafana_url" {
  description = "Grafana (chỉ mở cho my_ip_cidr)"
  value       = "http://${aws_instance.control_plane.public_ip}:30300"
}

output "next_steps" {
  description = "Các bước tiếp theo"
  value       = <<-EOT
    1. Dựng cluster:  bash ansible/run.sh
    2. Deploy app:    NODE_IP=${aws_instance.control_plane.public_ip} KUBECONFIG=ansible/artifacts/kubeconfig INSTALL_MONITORING=1 bash scripts/k8s-lab-deploy.sh
    3. Dọn dẹp (BẮT BUỘC sau buổi học): terraform -chdir=terraform destroy
  EOT
}
