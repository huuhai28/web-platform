from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Profile, Project


def seed_database(db: Session) -> None:
    if db.scalar(select(Profile.id).limit(1)) is None:
        db.add(
            Profile(
                name="Nguyễn Hữu Hải",
                role="DevOps & Cloud Engineer",
                summary=(
                    "Tôi xây dựng nền tảng có thể triển khai lặp lại, quan sát được và dễ vận hành — "
                    "từ container local đến Kubernetes và hạ tầng cloud bằng Terraform."
                ),
                location="Việt Nam · UTC+7",
                email="hai@example.com",
                availability="Sẵn sàng cho dự án DevOps, Cloud và Platform Engineering",
            )
        )

    if db.scalar(select(Project.id).limit(1)) is None:
        db.add_all(
            [
                Project(
                    title="Highly Available Web Platform",
                    description="ALB, Auto Scaling, private subnet và health check được quản lý bằng Terraform.",
                    stack="Terraform, AWS, EC2, ALB, Auto Scaling",
                    outcome="Hạ tầng tái tạo được và không có thay đổi ngoài ý muốn",
                    featured=True,
                ),
                Project(
                    title="Kubernetes Learning Cluster",
                    description="Cụm nhiều node cho ứng dụng, ingress, giám sát và quy trình triển khai container.",
                    stack="Kubernetes, Docker, Nginx, Linux",
                    outcome="Tách workload theo namespace và chuẩn hóa deployment",
                    featured=True,
                ),
                Project(
                    title="Terraform Practice Labs",
                    description="Chuỗi bài tập từ variables, state, modules đến remote backend và CI/CD.",
                    stack="Terraform, Docker, AWS, GitHub Actions",
                    outcome="Quản lý vòng đời hạ tầng bằng code và state an toàn",
                    featured=False,
                ),
            ]
        )

    db.commit()

