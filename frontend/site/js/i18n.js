/*
 * Song ngữ Việt / Anh — không cần thư viện.
 *
 * Cách dùng trong HTML:
 *   <span data-i18n="nav.about"></span>             → thay textContent
 *   <h2 data-i18n-html="about.title"></h2>          → thay innerHTML (cho chuỗi có <em>, <br>)
 *   <input data-i18n-attr="placeholder:form.namePh"> → thay thuộc tính (nhiều cái: "a:k1;b:k2")
 *
 * Chọn ngôn ngữ theo thứ tự: ?lang=en trên URL → lựa chọn đã lưu → ngôn ngữ trình duyệt → "vi".
 * Thêm/sửa câu chữ: sửa cả hai khối `vi` và `en` bên dưới.
 */
(function () {
  const STRINGS = {
    vi: {
      "meta.title": "Nguyễn Hữu Hải · DevOps & Cloud Engineer",
      "meta.description": "Portfolio của Nguyễn Hữu Hải — DevOps, Cloud và Platform Engineering. Docker, Kubernetes, Terraform, GitLab CI/CD.",
      "a11y.skip": "Bỏ qua tới nội dung",
      "a11y.home": "Về đầu trang",
      "a11y.mainNav": "Điều hướng chính",
      "a11y.menuOpen": "Mở menu",
      "a11y.menuClose": "Đóng menu",
      "a11y.lang": "Chọn ngôn ngữ",
      "a11y.status": "Trạng thái",
      "a11y.highlights": "Điểm nổi bật",
      "a11y.skillFilter": "Lọc kỹ năng",
      "a11y.portrait": "Ảnh chân dung Nguyễn Hữu Hải",

      "nav.about": "Giới thiệu",
      "nav.skills": "Kỹ năng",
      "nav.projects": "Dự án",
      "nav.architecture": "Kiến trúc",
      "nav.contact": "Liên hệ",

      "hero.hello": "Xin chào, tôi là",
      "hero.ctaProjects": "Xem dự án",
      "hero.ctaContact": "Trao đổi công việc",

      "proof.services": "service chạy trong project này",
      "proof.cicd": "GitLab pipeline build → deploy",
      "proof.k8s": "Kustomize, Helm, Ingress",
      "proof.iac": "Terraform trên AWS",

      "about.kicker": "01 — Giới thiệu",
      "about.title": "Tôi học bằng cách xây dựng những hệ thống <em>chạy được thật.</em>",
      "about.text": "Tôi tập trung vào DevOps, cloud và system design: mô hình hóa hạ tầng bằng code, đóng gói ứng dụng bằng container, đưa workload lên Kubernetes và tạo quy trình triển khai có thể lặp lại. Mục tiêu không chỉ là “chạy được”, mà còn phải hiểu vì sao nó hoạt động.",
      "about.p1": "Thay thao tác thủ công bằng cấu hình có version, review và khả năng tái tạo.",
      "about.p2": "Giảm bề mặt tấn công, tách secrets và chỉ mở đúng kết nối cần thiết.",
      "about.p3": "Health check, log và metric là một phần của thiết kế, không phải phần thêm sau.",

      "skills.kicker": "02 — Năng lực",
      "skills.title": "Công cụ chỉ hữu ích khi <em>kết nối thành hệ thống.</em>",
      "skills.all": "Tất cả",

      "projects.kicker": "03 — Dự án",
      "projects.title": "Những bài toán tôi đang <em>biến thành kinh nghiệm.</em>",
      "projects.outcome": "Kết quả",
      "projects.featured": "Nổi bật",

      "arch.kicker": "Kiến trúc của project này",
      "arch.title": "Bảy service, <em>một luồng hoàn chỉnh.</em>",
      "arch.text": "Nginx phục vụ HTML/CSS tĩnh và làm reverse proxy. Keycloak cấp token OIDC, FastAPI đọc/ghi PostgreSQL, còn Celery lấy việc từ Redis để gửi email nền. Toàn bộ chạy bằng Docker Compose hoặc Kubernetes (Helm), build và kiểm thử tự động bằng GitHub Actions.",
      "arch.repo": "Xem mã nguồn & pipeline",

      "account.kicker": "Khu vực quản trị",
      "account.hello": "Xin chào,",
      "account.text": "Token OIDC do Keycloak cấp đang được dùng để gọi API được bảo vệ.",
      "account.admin": "Quản trị viên",
      "account.visitor": "Người dùng đã đăng nhập",
      "account.messages": "Tin nhắn gần đây",
      "account.loading": "Đang tải...",
      "account.empty": "Chưa có tin nhắn.",
      "account.loadError": "Không tải được tin nhắn:",
      "account.logout": "Đăng xuất",
      "account.you": "bạn",

      "contact.kicker": "04 — Liên hệ",
      "contact.title": "Có một hệ thống cần <em>làm cho gọn hơn?</em>",
      "contact.text": "Gửi cho tôi bối cảnh, mục tiêu và vấn đề đang gặp — tôi sẽ phản hồi qua email.",
      "form.name": "Họ tên",
      "form.namePh": "Tên của bạn",
      "form.email": "Email",
      "form.subject": "Chủ đề",
      "form.subjectPh": "Ví dụ: Cần tư vấn Kubernetes",
      "form.message": "Nội dung",
      "form.messagePh": "Mô tả ngắn điều bạn muốn trao đổi...",
      "form.submit": "Gửi tin nhắn",
      "form.sending": "Đang gửi...",
      "form.sent": "✓ Đã gửi tin nhắn. Cảm ơn bạn, tôi sẽ phản hồi sớm!",
      "form.invalid": "Vui lòng kiểm tra lại các trường được đánh dấu đỏ.",
      "form.error": "Không gửi được:",
      "form.tooMany": "Bạn gửi hơi nhanh, vui lòng thử lại sau 1 phút.",
      "form.mailto": "✓ Đã mở ứng dụng email với nội dung bạn vừa nhập — bấm Gửi để hoàn tất.",

      "footer.top": "Lên đầu trang ↑",
    },

    en: {
      "meta.title": "Nguyen Huu Hai · DevOps & Cloud Engineer",
      "meta.description": "Portfolio of Nguyen Huu Hai — DevOps, Cloud and Platform Engineering. Docker, Kubernetes, Terraform, GitLab CI/CD.",
      "a11y.skip": "Skip to content",
      "a11y.home": "Back to top",
      "a11y.mainNav": "Main navigation",
      "a11y.menuOpen": "Open menu",
      "a11y.menuClose": "Close menu",
      "a11y.lang": "Choose language",
      "a11y.status": "Status",
      "a11y.highlights": "Highlights",
      "a11y.skillFilter": "Filter skills",
      "a11y.portrait": "Portrait of Nguyen Huu Hai",

      "nav.about": "About",
      "nav.skills": "Skills",
      "nav.projects": "Projects",
      "nav.architecture": "Architecture",
      "nav.contact": "Contact",

      "hero.hello": "Hi, I'm",
      "hero.ctaProjects": "View projects",
      "hero.ctaContact": "Let's talk",

      "proof.services": "services running in this project",
      "proof.cicd": "GitLab pipeline from build to deploy",
      "proof.k8s": "Kustomize, Helm, Ingress",
      "proof.iac": "Terraform on AWS",

      "about.kicker": "01 — About",
      "about.title": "I learn by building systems that <em>actually run.</em>",
      "about.text": "I focus on DevOps, cloud and system design: modelling infrastructure as code, packaging applications in containers, running workloads on Kubernetes and building repeatable delivery pipelines. The goal isn't just “it works” — it's understanding why it works.",
      "about.p1": "Replace manual steps with versioned, reviewable and reproducible configuration.",
      "about.p2": "Shrink the attack surface, keep secrets separate and open only the connections that are needed.",
      "about.p3": "Health checks, logs and metrics are part of the design, not an afterthought.",

      "skills.kicker": "02 — Skills",
      "skills.title": "Tools only matter when they <em>work together as a system.</em>",
      "skills.all": "All",

      "projects.kicker": "03 — Projects",
      "projects.title": "Problems I'm turning <em>into experience.</em>",
      "projects.outcome": "Outcome",
      "projects.featured": "Featured",

      "arch.kicker": "Project architecture",
      "arch.title": "Seven services, <em>one complete flow.</em>",
      "arch.text": "Nginx serves static HTML/CSS and acts as the reverse proxy. Keycloak issues OIDC tokens, FastAPI reads and writes PostgreSQL, and Celery picks jobs from Redis to send email in the background. Everything runs on Docker Compose or Kubernetes (Helm), built and tested automatically with GitHub Actions.",
      "arch.repo": "View source & pipeline",

      "account.kicker": "Admin area",
      "account.hello": "Hello,",
      "account.text": "An OIDC token issued by Keycloak is being used to call protected APIs.",
      "account.admin": "Administrator",
      "account.visitor": "Signed-in user",
      "account.messages": "Recent messages",
      "account.loading": "Loading...",
      "account.empty": "No messages yet.",
      "account.loadError": "Could not load messages:",
      "account.logout": "Sign out",
      "account.you": "there",

      "contact.kicker": "04 — Contact",
      "contact.title": "Got a system that needs <em>to be simpler?</em>",
      "contact.text": "Tell me about the context, your goals and the problem you're facing — I'll get back to you by email.",
      "form.name": "Name",
      "form.namePh": "Your name",
      "form.email": "Email",
      "form.subject": "Subject",
      "form.subjectPh": "e.g. Need help with Kubernetes",
      "form.message": "Message",
      "form.messagePh": "Briefly describe what you'd like to discuss...",
      "form.submit": "Send message",
      "form.sending": "Sending...",
      "form.sent": "✓ Message sent. Thank you — I will get back to you soon!",
      "form.invalid": "Please check the fields highlighted in red.",
      "form.error": "Could not send:",
      "form.tooMany": "You're sending too fast — please try again in a minute.",
      "form.mailto": "✓ Your email app is open with your message — press Send to finish.",

      "footer.top": "Back to top ↑",
    },
  };

  const SUPPORTED = Object.keys(STRINGS);
  const STORE_KEY = "pwp.lang";
  const listeners = [];

  function detect() {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (SUPPORTED.includes(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (SUPPORTED.includes(saved)) return saved;
    } catch { /* storage bị chặn */ }
    return (navigator.language || "vi").toLowerCase().startsWith("vi") ? "vi" : "en";
  }

  let lang = detect();

  function t(key) {
    return STRINGS[lang][key] ?? STRINGS.vi[key] ?? key;
  }

  function apply(root = document) {
    document.documentElement.lang = lang;
    document.title = t("meta.title");
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = t("meta.description");

    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    // Chỉ dùng cho chuỗi tĩnh trong file này (đáng tin), không bao giờ cho dữ liệu người dùng
    root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(";").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.querySelectorAll("[data-lang]").forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function setLang(next) {
    if (!SUPPORTED.includes(next) || next === lang) return;
    lang = next;
    try { localStorage.setItem(STORE_KEY, lang); } catch { /* bỏ qua */ }
    // Cập nhật ?lang= trên URL để link chia sẻ giữ đúng ngôn ngữ
    const url = new URL(location.href);
    url.searchParams.set("lang", lang);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  window.I18n = {
    t,
    apply,
    setLang,
    get lang() { return lang; },
    onChange(fn) { listeners.push(fn); },
  };
})();
