// ТГ Хаб — расширение. Что делает:
// 1) для сайтов из ВАШЕГО списка в хабе снимает запрет на показ внутри рамки (X-Frame-Options / CSP) — только когда сайт открыт из хаба;
// 2) для этих же сайтов делает cookie пригодными для рамки (SameSite=None), иначе вход в рамке не сохранится;
// 3) по команде хаба подставляет логин и пароль в поля входа на этих сайтах (кнопку «Войти» не нажимает).
const HUB = "https://tg-hub.onrender.com/";
const HUB_HOST = "tg-hub.onrender.com";
const SECOND = new Set(["co", "com", "org", "net", "gov", "ac"]);

function rootOf(host) {
  const p = host.toLowerCase().split(".").filter(Boolean);
  if (p.length <= 2) return p.join(".");
  const n = p[p.length - 1].length === 2 && SECOND.has(p[p.length - 2]) ? 3 : 2;
  return p.slice(-n).join(".");
}
function roots(urls) {
  const s = new Set();
  for (const u of urls) { try { const x = new URL(u); if (x.protocol === "https:" && x.hostname !== HUB_HOST) s.add(rootOf(x.hostname)); } catch (e) { /* пропуск */ } }
  return [...s];
}

async function setSites(urls) {
  const r = roots(urls);
  await chrome.storage.local.set({ roots: r });
  const rules = r.length ? [{
    id: 1, priority: 1,
    condition: { initiatorDomains: [HUB_HOST], requestDomains: r, resourceTypes: ["sub_frame"] },
    action: { type: "modifyHeaders", responseHeaders: [
      { header: "x-frame-options", operation: "remove" },
      { header: "content-security-policy", operation: "remove" },
      { header: "content-security-policy-report-only", operation: "remove" }
    ] }
  }] : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1], addRules: rules });
}

// SameSite=None для cookie сайтов из списка (нужно, чтобы вход работал внутри рамки)
chrome.cookies.onChanged.addListener(async ({ cookie, removed }) => {
  if (removed || !cookie.secure || cookie.sameSite === "no_restriction") return;
  const { roots: r = [] } = await chrome.storage.local.get("roots");
  const dom = cookie.domain.replace(/^\./, "");
  if (!r.some((x) => dom === x || dom.endsWith("." + x))) return;
  const set = { url: "https://" + dom + cookie.path, name: cookie.name, value: cookie.value, path: cookie.path, secure: true, httpOnly: cookie.httpOnly, sameSite: "no_restriction", storeId: cookie.storeId };
  if (!cookie.hostOnly) set.domain = cookie.domain;
  if (!cookie.session && cookie.expirationDate) set.expirationDate = cookie.expirationDate;
  try { await chrome.cookies.set(set); } catch (e) { /* игнор */ }
});

// Подстановка: код выполняется только во фреймах, чей домен совпал с адресом сайта
function fillFrame(login, pass, root) {
  const rootOf = (h) => { const p = h.toLowerCase().split("."); if (p.length <= 2) return h; const n = p[p.length - 1].length === 2 && ["co", "com", "org", "net", "gov", "ac"].includes(p[p.length - 2]) ? 3 : 2; return p.slice(-n).join("."); };
  if (rootOf(location.hostname) !== root) return;
  let n = 0;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 10 && getComputedStyle(e).visibility !== "hidden"; };
  const set = (e, val) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, val); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  const t = setInterval(() => {
    if (++n > 80) return clearInterval(t);
    const inputs = [...document.querySelectorAll("input")].filter(vis);
    const pw = inputs.find((e) => e.type === "password");
    if (pass && pw && !pw.value) set(pw, pass);
    if (login) {
      const lg = inputs.find((e) => e !== pw && !e.value && !/search|поиск/i.test((e.name || "") + (e.id || "") + (e.placeholder || "") + (e.getAttribute("aria-label") || "") + (e.type || "")) && (e.type === "tel" || e.type === "email" || (e.type === "text" && /user|login|phone|email|mail/i.test((e.name || "") + (e.autocomplete || "") + (e.id || "")))));
      if (lg) set(lg, login);
    }
  }, 500);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id || !sender.tab || !(sender.url || "").startsWith(HUB)) return;
  if (msg.type === "sites") setSites(msg.urls);
  if (msg.type === "fill" && (msg.login || msg.pass)) {
    let root; try { const u = new URL(msg.url); if (u.protocol !== "https:") return; root = rootOf(u.hostname); } catch (e) { return; }
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, allFrames: true }, func: fillFrame, args: [msg.login, msg.pass, root] }).catch(() => {});
  }
});
