/*
 * Logic giao diện: render dữ liệu, song ngữ, menu mobile, hiệu ứng cuộn, form liên hệ, khu vực quản trị.
 * Mọi dữ liệu từ API đều được escape trước khi đưa vào HTML để tránh XSS.
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const data = window.PORTFOLIO;
  const t = (key) => I18n.t(key);
  /** Lấy bản đúng ngôn ngữ của một trường { vi, en }; chuỗi thường thì trả nguyên. */
  const L = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v[I18n.lang] ?? v.vi : v);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (window.Auth && Auth.token) headers.set("Authorization", `Bearer ${Auth.token}`);
    const res = await fetch(path, { ...options, headers });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const detail = Array.isArray(payload.detail) ? payload.detail[0]?.msg : payload.detail;
      const err = new Error(detail || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // ---------- Profile ----------
  function renderProfile() {
    const p = data.profile;
    $("#profile-role").textContent = L(p.role);
    $("#profile-summary").textContent = L(p.summary);
    $("#profile-location").textContent = L(p.location);
    $("#profile-availability").textContent = L(p.availability);
    const email = $("#profile-email");
    email.textContent = p.email;
    email.href = `mailto:${p.email}`;
  }

  // ---------- Skills ----------
  const ALL = "__all";
  let activeCategory = ALL;

  function renderFilters() {
    const categories = [ALL, ...new Set(data.skills.map((s) => s.category))];
    $("#skill-filters").innerHTML = categories
      .map((c) => {
        const label = c === ALL ? t("skills.all") : c;
        return `<button type="button" class="${c === activeCategory ? "active" : ""}" aria-pressed="${c === activeCategory}" data-category="${escapeHtml(c)}">${escapeHtml(label)}</button>`;
      })
      .join("");
  }

  function renderSkills() {
    const list = activeCategory === ALL ? data.skills : data.skills.filter((s) => s.category === activeCategory);
    $("#skill-grid").innerHTML = list
      .map(
        (s) => `
        <article class="card skill-card reveal" data-level="${Number(s.level)}">
          <div class="skill-badge">${escapeHtml(s.short)}</div>
          <h3>${escapeHtml(s.name)}</h3>
          <p>${escapeHtml(L(s.note))}</p>
          <strong class="skill-level">${Number(s.level)}<small>%</small></strong>
          <div class="meter" role="meter" aria-label="${escapeHtml(s.name)}" aria-valuenow="${Number(s.level)}" aria-valuemin="0" aria-valuemax="100"><span></span></div>
        </article>`,
      )
      .join("");
    // Gán qua CSSOM thay vì style="" để không vi phạm Content-Security-Policy
    $$("#skill-grid .skill-card").forEach((card) => card.style.setProperty("--level", `${card.dataset.level}%`));
    observe($$("#skill-grid .reveal"));
  }

  $("#skill-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-category]");
    if (!btn) return;
    activeCategory = btn.dataset.category;
    renderFilters();
    renderSkills();
  });

  // ---------- Projects ----------
  function renderProjects() {
    $("#project-list").innerHTML = data.projects
      .map(
        (p, i) => `
        <article class="card project reveal">
          <div class="project-index">${String(i + 1).padStart(2, "0")}</div>
          <div>
            <div class="project-title">
              <h3>${escapeHtml(L(p.title))}</h3>
              ${p.featured ? `<span class="badge-featured">${escapeHtml(t("projects.featured"))}</span>` : ""}
            </div>
            <p>${escapeHtml(L(p.description))}</p>
            <div class="tags">${String(p.stack || "")
              .split(",")
              .filter((s) => s.trim())
              .map((s) => `<span class="tag">${escapeHtml(s.trim())}</span>`)
              .join("")}</div>
          </div>
          <div class="project-outcome"><small>${escapeHtml(t("projects.outcome"))}</small><strong>${escapeHtml(L(p.outcome))}</strong></div>
        </article>`,
      )
      .join("");
    observe($$("#project-list .reveal"));
  }

  // ---------- Architecture ----------
  function renderArchitecture() {
    $("#arch-flow").innerHTML = data.architecture
      .map((n) => `<li class="arch-node"><b>${escapeHtml(L(n.label))}</b><small>${escapeHtml(L(n.detail))}</small></li>`)
      .join("");
  }

  // ---------- Hiệu ứng hiện dần khi cuộn ----------
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("in");
                io.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        )
      : null;

  function observe(elements) {
    elements.forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  }

  // Khi cuộn rất nhanh (hoặc bấm link #anchor), có phần tử bị "nhảy qua" mà không giao với viewport,
  // nên IntersectionObserver không báo. Quét bổ sung: phần tử nào đã ở phía trên đáy màn hình thì hiện luôn.
  function sweepPassed() {
    $$(".reveal:not(.in)").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add("in");
        if (io) io.unobserve(el);
      }
    });
  }
  window.addEventListener("scroll", sweepPassed, { passive: true });

  // Đếm số (proof strip)
  function animateCounters() {
    $$("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count);
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / 900, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- Header: đổ bóng khi cuộn + đánh dấu mục đang xem ----------
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mục đang xem = section cuối cùng có mép trên đã vượt qua 40% chiều cao màn hình.
  // Khi đã cuộn tới đáy trang thì luôn chọn section cuối (Liên hệ).
  const navLinks = $$(".nav a[href^='#']");
  const sections = ["about", "skills", "projects", "architecture", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  function updateActiveNav() {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    let current = null;
    if (atBottom) current = sections[sections.length - 1];
    else sections.forEach((s) => { if (s.getBoundingClientRect().top <= window.innerHeight * 0.4) current = s; });
    navLinks.forEach((a) => a.classList.toggle("active", Boolean(current) && a.getAttribute("href") === `#${current.id}`));
  }
  window.addEventListener("scroll", updateActiveNav, { passive: true });
  updateActiveNav();

  // ---------- Menu mobile ----------
  const toggle = $("#menu-toggle");
  const nav = $("#nav");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", t(open ? "a11y.menuClose" : "a11y.menuOpen"));
  }
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // ---------- Nút chọn ngôn ngữ ----------
  $$("[data-lang]").forEach((btn) => btn.addEventListener("click", () => I18n.setLang(btn.dataset.lang)));

  // ---------- Ảnh chân dung: nếu chưa có assets/avatar.jpg thì hiện chữ viết tắt ----------
  const img = $("#portrait-img");
  const showFallback = () => img.closest(".portrait").classList.add("no-photo");
  img.addEventListener("error", showFallback);
  if (img.complete && img.naturalWidth === 0) showFallback();

  // ---------- Đồng hồ giờ Việt Nam ----------
  const clock = $("#local-clock");
  const tick = () => {
    clock.textContent = new Intl.DateTimeFormat(I18n.lang === "vi" ? "vi-VN" : "en-GB", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
  };
  tick();
  setInterval(tick, 30_000);
  $("#year").textContent = new Date().getFullYear();

  // ---------- Form liên hệ ----------
  const form = $("#contact-form");
  const status = $("#form-status");
  const submit = $("#contact-submit");
  let formState = { key: "", cls: "", extra: "" }; // giữ trạng thái để dịch lại khi đổi ngôn ngữ

  function showStatus(key = "", cls = "", extra = "") {
    formState = { key, cls, extra };
    status.className = `form-status ${cls}`.trim();
    status.textContent = key ? `${t(key)}${extra ? " " + extra : ""}` : "";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showStatus();
    let valid = true;
    $$("input, textarea", form).forEach((field) => {
      const ok = field.checkValidity();
      field.classList.toggle("invalid", !ok);
      if (!ok) valid = false;
    });
    if (!valid) return showStatus("form.invalid", "err");

    submit.disabled = true;
    submit.textContent = t("form.sending");
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await api("/api/contact", { method: "POST", body: JSON.stringify(body) });
      form.reset();
      showStatus("form.sent", "ok");
    } catch (err) {
      if (err.status === 429) showStatus("form.tooMany", "err");
      else showStatus("form.error", "err", err.message);
    } finally {
      submit.disabled = false;
      submit.textContent = t("form.submit");
    }
  });

  form.addEventListener("input", (e) => {
    if (e.target.classList.contains("invalid") && e.target.checkValidity()) e.target.classList.remove("invalid");
  });

  // ---------- Đăng nhập & khu vực quản trị ----------
  // Khách xem trang không cần đăng nhập nên không có nút "Đăng nhập".
  // Chủ trang vào khu vực quản trị bằng cách mở đường dẫn  https://<domain>/#admin
  function adminEntry() {
    if (location.hash !== "#admin") return;
    history.replaceState(null, "", location.pathname + location.search);
    if (!Auth.token) Auth.login();
    else document.getElementById("account").scrollIntoView();
  }
  window.addEventListener("hashchange", adminEntry);

  let authenticated = false;
  let messages = null; // null = chưa tải, Error = lỗi, [] = mảng tin nhắn

  function renderAuth() {
    const slot = $("#auth-slot");
    if (!authenticated) {
      slot.innerHTML = "";
      $("#account").hidden = true;
      return;
    }
    const claims = Auth.claims() || {};
    const name = claims.preferred_username || claims.name || t("account.you");
    slot.innerHTML = `<span class="user-chip" title="${escapeHtml(name)}">● ${escapeHtml(name)}</span>
      <button class="btn btn-ghost btn-sm" id="logout-btn" type="button">${escapeHtml(t("account.logout"))}</button>`;
    $("#logout-btn").addEventListener("click", () => Auth.logout());

    const isAdmin = Auth.hasRole("portfolio-admin");
    $("#account").hidden = false;
    $("#account-name").textContent = name;
    $("#account-role").textContent = t(isAdmin ? "account.admin" : "account.visitor");
    $("#admin-messages").hidden = !isAdmin;
    renderMessages();
  }

  function renderMessages() {
    const list = $("#message-list");
    if (messages === null) list.innerHTML = `<p>${escapeHtml(t("account.loading"))}</p>`;
    else if (messages instanceof Error) list.innerHTML = `<p>${escapeHtml(t("account.loadError"))} ${escapeHtml(messages.message)}</p>`;
    else if (!messages.length) list.innerHTML = `<p>${escapeHtml(t("account.empty"))}</p>`;
    else
      list.innerHTML = messages
        .slice(0, 5)
        .map(
          (m) => `<article class="message">
            <b>${escapeHtml(m.subject)}</b>
            <span>${escapeHtml(m.name)} · ${escapeHtml(m.email)}</span>
            <p>${escapeHtml(m.message)}</p>
          </article>`,
        )
        .join("");
  }

  async function loadMessages() {
    try {
      messages = await api("/api/admin/messages");
    } catch (err) {
      messages = err;
    }
    renderMessages();
  }

  // ---------- Vẽ lại toàn bộ nội dung khi đổi ngôn ngữ ----------
  function renderContent() {
    renderProfile();
    renderFilters();
    renderSkills();
    renderProjects();
    renderArchitecture();
    renderAuth();
    showStatus(formState.key, formState.cls, formState.extra);
    if (!submit.disabled) submit.textContent = t("form.submit");
    setMenu(nav.classList.contains("open"));
    tick();
    sweepPassed();
  }
  I18n.onChange(renderContent);

  // ---------- Khởi động ----------
  I18n.apply();
  renderContent();
  observe($$(".reveal"));
  animateCounters();

  Auth.init()
    .then((ok) => {
      authenticated = ok;
      renderAuth();
      if (ok && Auth.hasRole("portfolio-admin")) loadMessages();
    })
    .catch(() => { authenticated = false; renderAuth(); })
    .finally(adminEntry);
})();
