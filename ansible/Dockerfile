# Máy điều khiển Ansible đóng gói trong container — chạy được trên Windows/macOS/Linux chỉ cần Docker.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-client \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir "ansible==10.7.0" "ansible-lint==24.12.2"

WORKDIR /work/ansible
ENV ANSIBLE_FORCE_COLOR=1
