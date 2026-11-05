/*
 * Đăng nhập Keycloak bằng OpenID Connect Authorization Code + PKCE,
 * viết bằng JavaScript thuần (không cần thư viện keycloak-js).
 *
 * Luồng:
 *  1. login(): tạo code_verifier ngẫu nhiên → băm SHA-256 thành code_challenge
 *     → chuyển hướng sang trang đăng nhập Keycloak.
 *  2. Keycloak chuyển về /?code=...&state=... → handleCallback() đổi code lấy token.
 *  3. Token lưu trong sessionStorage (mất khi đóng tab), tự refresh trước khi hết hạn.
 */
(function () {
  const REALM_URL = `${location.origin}/auth/realms/personal-web/protocol/openid-connect`;
  const CLIENT_ID = "portfolio-frontend";
  const REDIRECT_URI = `${location.origin}/`;
  const STORE_KEY = "pwp.tokens";
  const PKCE_KEY = "pwp.pkce";

  let tokens = null;
  let refreshTimer = null;

  // ---------- tiện ích ----------
  function base64url(bytes) {
    let str = "";
    bytes.forEach((b) => (str += String.fromCharCode(b)));
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomString(length = 48) {
    return base64url(crypto.getRandomValues(new Uint8Array(length)));
  }

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  }

  function decodeJwt(token) {
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(payload)
          .split("")
          .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
          .join(""),
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key); } catch { return null; }
  }
  function safeSet(storage, key, value) {
    try { storage.setItem(key, value); } catch { /* bỏ qua khi bị chặn storage */ }
  }
  function safeRemove(storage, key) {
    try { storage.removeItem(key); } catch { /* bỏ qua */ }
  }

  async function tokenRequest(params) {
    const res = await fetch(`${REALM_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
    });
    if (!res.ok) throw new Error(`Token endpoint trả về HTTP ${res.status}`);
    return res.json();
  }

  function saveTokens(data) {
    tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      id_token: data.id_token || (tokens && tokens.id_token),
    };
    safeSet(sessionStorage, STORE_KEY, JSON.stringify(tokens));
    scheduleRefresh();
  }

  function clearTokens() {
    tokens = null;
    safeRemove(sessionStorage, STORE_KEY);
    if (refreshTimer) clearTimeout(refreshTimer);
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const claims = tokens && decodeJwt(tokens.access_token);
    if (!claims || !claims.exp) return;
    const msLeft = claims.exp * 1000 - Date.now() - 45_000; // refresh trước 45 giây
    refreshTimer = setTimeout(refresh, Math.max(msLeft, 5_000));
  }

  async function refresh() {
    if (!tokens || !tokens.refresh_token) return false;
    try {
      saveTokens(await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }));
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }

  // ---------- API công khai ----------
  async function login() {
    const verifier = randomString(48);
    const state = randomString(16);
    safeSet(sessionStorage, PKCE_KEY, JSON.stringify({ verifier, state }));
    const challenge = base64url(await sha256(verifier));
    const url = new URL(`${REALM_URL}/auth`);
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      response_mode: "query",
      scope: "openid profile email",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    }).toString();
    location.assign(url.toString());
  }

  function logout() {
    const idToken = tokens && tokens.id_token;
    clearTokens();
    const url = new URL(`${REALM_URL}/logout`);
    const params = { client_id: CLIENT_ID, post_logout_redirect_uri: REDIRECT_URI };
    if (idToken) params.id_token_hint = idToken;
    url.search = new URLSearchParams(params).toString();
    location.assign(url.toString());
  }

  async function handleCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code && !params.get("error")) return;

    // Xóa code/state khỏi thanh địa chỉ dù thành công hay thất bại
    history.replaceState(null, "", location.pathname + location.hash);

    const saved = JSON.parse(safeGet(sessionStorage, PKCE_KEY) || "null");
    safeRemove(sessionStorage, PKCE_KEY);
    if (!code || !saved || saved.state !== state) return;

    saveTokens(
      await tokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: saved.verifier,
      }),
    );
  }

  /** Khởi tạo: xử lý callback hoặc khôi phục phiên cũ. Trả về true nếu đã đăng nhập. */
  async function init() {
    try {
      await handleCallback();
    } catch (err) {
      console.warn("Đăng nhập thất bại:", err);
    }
    if (!tokens) {
      const stored = JSON.parse(safeGet(sessionStorage, STORE_KEY) || "null");
      if (stored && stored.access_token) {
        tokens = stored;
        const claims = decodeJwt(tokens.access_token);
        if (!claims || claims.exp * 1000 < Date.now() + 10_000) await refresh();
        else scheduleRefresh();
      }
    }
    return Boolean(tokens);
  }

  function claims() {
    return tokens ? decodeJwt(tokens.access_token) : null;
  }

  function hasRole(role) {
    const c = claims();
    return Boolean(c && c.realm_access && Array.isArray(c.realm_access.roles) && c.realm_access.roles.includes(role));
  }

  window.Auth = {
    init,
    login,
    logout,
    hasRole,
    claims,
    get token() { return tokens ? tokens.access_token : null; },
  };
})();
