/*
 * Nội dung của trang, song ngữ. Sửa ở đây để đổi chữ, kỹ năng, dự án.
 * Trường nào có dạng { vi: "...", en: "..." } thì có bản dịch; chuỗi thường dùng chung cho cả hai.
 *
 * Đây là nguồn nội dung duy nhất của trang cho cả hai ngôn ngữ (database chỉ lưu tiếng Việt và
 * danh sách dự án ở đó khác file này, nên frontend không đọc /api/profile, /api/projects nữa).
 * Backend vẫn xử lý form liên hệ và khu vực quản trị.
 */
window.PORTFOLIO = {
  profile: {
    name: "Nguyễn Hữu Hải",
    role: "DevOps & Cloud Engineer",
    summary: {
      vi: "Tôi xây dựng nền tảng có thể triển khai lặp lại, quan sát được và dễ vận hành — từ container local đến Kubernetes và hạ tầng cloud bằng Terraform.",
      en: "I build platforms that are repeatable to deploy, observable and easy to operate — from local containers to Kubernetes and cloud infrastructure with Terraform.",
    },
    location: { vi: "Việt Nam · Remote", en: "Vietnam · Remote" },
    email: "nguyenhai281103@gmail.com",
    availability: { vi: "Sẵn sàng cho dự án mới", en: "Open to new projects" },
  },

  skills: [
    { category: "Infrastructure", name: "Terraform", short: "Tf", level: 82, note: { vi: "Modules, state, AWS", en: "Modules, state, AWS" } },
    { category: "Platform", name: "Kubernetes", short: "K8s", level: 78, note: { vi: "Workloads, Ingress, Helm", en: "Workloads, Ingress, Helm" } },
    { category: "Containers", name: "Docker", short: "Dk", level: 88, note: { vi: "Images, Compose", en: "Images, Compose" } },
    { category: "Platform", name: "GitLab CI/CD", short: "CI", level: 80, note: { vi: "Pipeline, runner, registry", en: "Pipelines, runners, registry" } },
    { category: "Cloud", name: "AWS", short: "AWS", level: 72, note: { vi: "VPC, EC2, ALB, S3", en: "VPC, EC2, ALB, S3" } },
    { category: "Backend", name: "Python", short: "Py", level: 76, note: { vi: "FastAPI, tự động hóa", en: "FastAPI, automation" } },
    { category: "Systems", name: "Linux", short: "Lx", level: 80, note: { vi: "Networking, vận hành", en: "Networking, operations" } },
    { category: "Systems", name: "Nginx", short: "Nx", level: 74, note: { vi: "Reverse proxy, TLS", en: "Reverse proxy, TLS" } },
  ],

  projects: [
    {
      id: 1,
      title: "Highly Available Web Platform",
      description: {
        vi: "ALB, Auto Scaling, private subnet và health check được quản lý bằng Terraform.",
        en: "ALB, Auto Scaling, private subnets and health checks, all managed with Terraform.",
      },
      stack: "Terraform, AWS, EC2, ALB",
      outcome: { vi: "Hạ tầng tái tạo được", en: "Reproducible infrastructure" },
      featured: true,
    },
    {
      id: 2,
      title: "Kubernetes Learning Cluster",
      description: {
        vi: "Cụm nhiều node cho ứng dụng, ingress, giám sát và quy trình triển khai container.",
        en: "A multi-node cluster for applications, ingress, monitoring and container delivery workflows.",
      },
      stack: "Kubernetes, Docker, Linux",
      outcome: { vi: "Triển khai workload nhất quán", en: "Consistent workload deployments" },
      featured: true,
    },
    {
      id: 3,
      title: "Personal Web Platform",
      description: {
        vi: "Chính trang này: Nginx + FastAPI + Keycloak + PostgreSQL + Redis/Celery, đóng gói Docker, Helm chart cho Kubernetes, CI/CD bằng GitHub Actions.",
        en: "This very site: Nginx + FastAPI + Keycloak + PostgreSQL + Redis/Celery, packaged with Docker, a Helm chart for Kubernetes, CI/CD with GitHub Actions.",
      },
      stack: "Docker Compose, Helm, GitHub Actions, FastAPI, Keycloak",
      outcome: { vi: "Full-stack chạy thật trên Internet", en: "Full stack running live on the Internet" },
      featured: false,
    },
  ],

  architecture: [
    { label: "Web", detail: "Nginx + HTML/CSS" },
    { label: "Identity", detail: "Keycloak / OIDC" },
    { label: "API", detail: "Python FastAPI" },
    { label: "Data", detail: "PostgreSQL" },
    { label: "Async", detail: "Redis + Celery" },
  ],
};
