// Kiểm tra frontend tĩnh (chạy trong CI, không cần trình duyệt):
//  1. Cú pháp mọi file JS
//  2. Mọi khóa i18n dùng trong HTML/JS đều có bản "vi" và "en"
//  3. Mọi trường song ngữ trong data.js đều có đủ "vi" và "en"
// Chạy: node scripts/check_frontend.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const site = new URL("../frontend/site/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(join(site, p), "utf8");
let errors = 0;
const fail = (msg) => { console.error("✗", msg); errors++; };

// 1. Cú pháp
for (const f of readdirSync(join(site, "js")).filter((f) => f.endsWith(".js"))) {
  try { new vm.Script(read(`js/${f}`), { filename: f }); console.log("✓ syntax", f); }
  catch (e) { fail(`syntax ${f}: ${e.message}`); }
}

// Nạp i18n.js và data.js trong sandbox giả lập trình duyệt
const ctx = { window: {}, location: { search: "", href: "http://x/", pathname: "/", hash: "" }, navigator: { language: "vi" },
  localStorage: { getItem: () => null, setItem() {} }, history: { replaceState() {} }, document: { documentElement: {}, querySelector: () => null, querySelectorAll: () => [] }, URL, URLSearchParams };
vm.createContext(ctx);
vm.runInContext(read("js/i18n.js"), ctx);
vm.runInContext(read("js/data.js"), ctx);
const strings = vm.runInContext(read("js/i18n.js").match(/const STRINGS = (\{[\s\S]*?\n  \});/)[1].replace(/^/, "(") + ")", ctx);

// 2. Khóa i18n
const html = read("index.html");
const app = read("js/app.js");
const keys = new Set();
for (const m of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(";").forEach((p) => keys.add(p.split(":")[1].trim()));
for (const m of app.matchAll(/\bt\(\s*"([a-zA-Z0-9]+\.[a-zA-Z0-9.]+)"\s*\)/g)) keys.add(m[1]);
for (const m of app.matchAll(/"((?:account|form|a11y|projects|skills)\.[a-zA-Z]+)"/g)) keys.add(m[1]);
for (const k of keys) for (const lang of ["vi", "en"]) if (!(k in strings[lang])) fail(`thiếu khóa "${k}" trong ${lang}`);
const vi = Object.keys(strings.vi), en = Object.keys(strings.en);
vi.filter((k) => !en.includes(k)).forEach((k) => fail(`"${k}" có ở vi nhưng thiếu ở en`));
en.filter((k) => !vi.includes(k)).forEach((k) => fail(`"${k}" có ở en nhưng thiếu ở vi`));
console.log(`✓ i18n: ${keys.size} khóa được dùng, ${vi.length} khóa mỗi ngôn ngữ`);

// 3. Trường song ngữ trong data.js
let fields = 0;
(function walk(v, path) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    if ("vi" in v || "en" in v) {
      fields++;
      if (!v.vi || !v.en) fail(`data.js ${path} thiếu bản ${!v.vi ? "vi" : "en"}`);
      return;
    }
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
})(ctx.window.PORTFOLIO, "PORTFOLIO");
console.log(`✓ data.js: ${fields} trường song ngữ`);

if (errors) { console.error(`\n${errors} lỗi`); process.exit(1); }
console.log("\nFrontend OK");
