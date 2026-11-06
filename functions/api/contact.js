/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Khi trang chạy trên Cloudflare Pages (không có FastAPI), function này thay backend nhận form
 * liên hệ và gửi email cho chủ trang qua Resend (https://resend.com, gói miễn phí 3.000 email/tháng).
 * Cùng đường dẫn, cùng định dạng JSON với FastAPI nên frontend không cần biết đang chạy ở đâu.
 *
 * Biến môi trường (Cloudflare → Workers & Pages → web-platform → Settings → Variables and Secrets):
 *   RESEND_API_KEY      (Secret)  API key của Resend, dạng re_...
 *   CONTACT_TO_EMAIL    (Text)    email nhận tin nhắn — phải là email đăng ký Resend nếu chưa verify domain
 *   CONTACT_FROM_EMAIL  (Text, tùy chọn) mặc định "Portfolio <onboarding@resend.dev>"
 *
 * Thiếu cấu hình → trả 503, frontend tự chuyển sang mở ứng dụng email của khách (mailto).
 */

const LIMITS = {
  name: [2, 120],
  subject: [3, 200],
  message: [10, 5000],
};
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const MAX_BODY_BYTES = 20_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Lỗi theo đúng dạng FastAPI/Pydantic: { detail: [{ loc, msg }] } để frontend hiển thị như nhau. */
function validationError(errors) {
  return json({ detail: errors.map(([field, msg]) => ({ loc: ["body", field], msg })) }, 422);
}

function validate(payload) {
  const errors = [];
  const data = {};
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    const value = typeof payload[field] === "string" ? payload[field].trim() : "";
    if (value.length < min || value.length > max) errors.push([field, `${field} must be ${min}-${max} characters`]);
    data[field] = value;
  }
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) errors.push(["email", "email is not a valid email address"]);
  data.email = email;
  return { data, errors };
}

export async function onRequestPost({ request, env }) {
  // Chỉ nhận request gửi từ chính trang này (chặn site khác lợi dụng form để gửi spam)
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ detail: "Forbidden" }, 403);

  if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
    return json({ detail: "Content-Type must be application/json" }, 415);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ detail: "Payload too large" }, 413);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (!payload || typeof payload !== "object") return json({ detail: "Invalid JSON" }, 400);

  // Bẫy bot: ô "website" bị ẩn với người thật. Bot điền vào → giả vờ thành công, không gửi email.
  if (typeof payload.website === "string" && payload.website.trim() !== "") {
    return json({ id: 0, created_at: new Date().toISOString() }, 201);
  }

  const { data, errors } = validate(payload);
  if (errors.length) return validationError(errors);

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
    return json({ detail: "Contact form is not configured" }, 503);
  }

  const subject = `[Portfolio] ${data.subject}`.replace(/[\r\n]+/g, " ");
  const text =
    `Tên: ${data.name}\nEmail: ${data.email}\n` +
    `IP: ${request.headers.get("CF-Connecting-IP") || "unknown"} · ${request.headers.get("CF-IPCountry") || ""}\n\n` +
    `${data.message}\n`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL || "Portfolio <onboarding@resend.dev>",
      to: [env.CONTACT_TO_EMAIL],
      reply_to: data.email, // bấm "Trả lời" trong Gmail là trả lời thẳng cho khách
      subject,
      text,
    }),
  });

  if (!res.ok) {
    // Ghi log để xem trong Cloudflare (Deployments → View details → Functions → Real-time logs)
    console.error("Resend error", res.status, await res.text().catch(() => ""));
    return json({ detail: "Could not send message right now" }, 502);
  }

  const sent = await res.json().catch(() => ({}));
  return json({ id: sent.id || 0, ...data, created_at: new Date().toISOString() }, 201);
}
