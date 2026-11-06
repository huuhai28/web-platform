// Khởi tạo Swagger UI (file riêng thay vì script inline để tuân thủ Content-Security-Policy)
window.addEventListener("DOMContentLoaded", () => {
  window.SwaggerUIBundle({
    url: "openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    docExpansion: "list",
    defaultModelsExpandDepth: 0,
    displayRequestDuration: true,
    // Trên Cloudflare Pages chỉ POST /api/contact chạy thật → chỉ cho "Try it out" với POST
    supportedSubmitMethods: ["post"],
    syntaxHighlight: { theme: "monokai" },
  });
});
