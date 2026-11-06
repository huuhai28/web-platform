# Frontend là HTML/CSS/JS tĩnh: không cần Node, không cần bước build.
FROM nginx:1.27-alpine

# Đích proxy /api (đổi được khi chạy, ví dụ khi đặt API Gateway phía trước backend)
ENV API_UPSTREAM=backend:8000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY site/ /usr/share/nginx/html/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
