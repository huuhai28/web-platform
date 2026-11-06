// Test Cloudflare Pages Function /api/contact — chạy: node --test tests/
// Không gửi email thật: fetch tới Resend được thay bằng hàm giả.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// functions/*.js là ES module nhưng repo không có package.json "type": "module",
// nên nạp qua data: URL để Node hiểu đúng cú pháp export.
const src = readFileSync(new URL("../../functions/api/contact.js", import.meta.url), "utf8");
const { onRequestPost } = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(src));

const ORIGIN = "https://web-platform.pages.dev";
const ENV = { RESEND_API_KEY: "re_test", CONTACT_TO_EMAIL: "owner@example.com" };
const VALID = {
  name: "Nhà tuyển dụng",
  email: "hr@example.com",
  subject: "Mời phỏng vấn",
  message: "Chúng tôi muốn trao đổi về vị trí DevOps.",
};

let calls;
function mockResend(status = 200, body = { id: "email_123" }) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status });
  };
}

function post(payload, { env = ENV, headers = {} } = {}) {
  const request = new Request(`${ORIGIN}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  return onRequestPost({ request, env });
}

beforeEach(() => { calls = []; mockResend(); });

test("gửi email qua Resend khi dữ liệu hợp lệ", async () => {
  const res = await post(VALID);
  assert.equal(res.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer re_test");
  assert.deepEqual(calls[0].body.to, ["owner@example.com"]);
  assert.equal(calls[0].body.reply_to, "hr@example.com");
  assert.equal(calls[0].body.subject, "[Portfolio] Mời phỏng vấn");
  assert.match(calls[0].body.text, /vị trí DevOps/);
});

test("dữ liệu sai → 422 theo định dạng FastAPI, không gửi email", async () => {
  const res = await post({ name: "a", email: "not-email", subject: "x", message: "short" });
  assert.equal(res.status, 422);
  const fields = (await res.json()).detail.map((d) => d.loc.at(-1)).sort();
  assert.deepEqual(fields, ["email", "message", "name", "subject"]);
  assert.equal(calls.length, 0);
});

test("ô bẫy bot được điền → giả vờ thành công, không gửi email", async () => {
  const res = await post({ ...VALID, website: "http://spam.example" });
  assert.equal(res.status, 201);
  assert.equal(calls.length, 0);
});

test("request từ trang khác → 403", async () => {
  const res = await post(VALID, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("chưa cấu hình API key → 503 (frontend chuyển sang mailto)", async () => {
  const res = await post(VALID, { env: {} });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
});

test("Resend lỗi → 502 (frontend chuyển sang mailto)", async () => {
  mockResend(401, { message: "invalid key" });
  const origError = console.error;
  console.error = () => {};
  try {
    const res = await post(VALID);
    assert.equal(res.status, 502);
  } finally {
    console.error = origError;
  }
});

test("JSON hỏng → 400, body quá lớn → 413, sai Content-Type → 415", async () => {
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post({ ...VALID, message: "x".repeat(30_000) })).status, 413);
  assert.equal((await post(VALID, { headers: { "Content-Type": "text/plain" } })).status, 415);
});

test("xuống dòng trong tiêu đề bị loại bỏ (chống chèn header email)", async () => {
  await post({ ...VALID, subject: "Hello\r\nBcc: victim@example.com" });
  assert.equal(calls[0].body.subject, "[Portfolio] Hello Bcc: victim@example.com");
});
