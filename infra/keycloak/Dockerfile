# Keycloak production: "build" cấu hình một lần lúc build image, sau đó chạy `start --optimized`.
# Tránh bước Quarkus augmentation mỗi lần khởi động (chậm ~30s và ngốn >1.5 GB RAM).
FROM quay.io/keycloak/keycloak:26.4 AS builder

ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false \
    KC_HTTP_RELATIVE_PATH=/auth

RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.4
COPY --from=builder /opt/keycloak/ /opt/keycloak/

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
