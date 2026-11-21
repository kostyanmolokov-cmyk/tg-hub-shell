// Оболочка: слева сети, сверху вкладки аккаунтов, в центре настоящий сайт.
// У каждой вкладки свой профиль (partition) — свои куки и вход, ничего не смешивается.
const { app, BrowserWindow, WebContentsView, ipcMain, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const DIMS = { RAIL: 58, TABBAR: 44, BAR: 40 };   // размеры панелей интерфейса, px
// если сеть одна и вкладка одна — показываем только хаб, без боковой и верхней панелей
const compact = () => state.networks.length === 1 && state.networks[0].accounts.length === 1;
const CFG = () => path.join(app.getPath("userData"), "shell.json");
const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT = {
  v: 2,
  networks: [
    { id: "hub", label: "ТГ", name: "Telegram (хаб)", url: "https://tg-hub.onrender.com/", accounts: [{ id: "h1", name: "Хаб" }] },
  ],
  active: { net: "hub", acc: "h1" },
};
let state = DEFAULT;
function load() {
  try { state = JSON.parse(fs.readFileSync(CFG(), "utf8")); } catch (e) { state = JSON.parse(JSON.stringify(DEFAULT)); }
  // старый конфиг (с отдельной вкладкой VK) заменяем: ВК и другие сайты теперь открываются внутри хаба кнопкой 🌐
  if (state.v !== 2 || !state.networks || !state.networks.length) state = JSON.parse(JSON.stringify(DEFAULT));
}
function save() { try { fs.writeFileSync(CFG(), JSON.stringify(state, null, 2)); } catch (e) { console.error(e); } }

let win = null, modalOpen = false;
const views = new Map();     // "net:acc" -> WebContentsView
const badges = {};           // "net:acc" -> число непрочитанных
const key = (n, a) => n + ":" + a;
const findNet = (id) => state.networks.find((n) => n.id === id);

function pushState() { if (win) win.webContents.send("state", state); }
function pushBadges() { if (win) win.webContents.send("badges", badges); }

function bounds() {
  const [w, h] = win.getContentSize();
  const c = compact(), R = c ? 0 : DIMS.RAIL, T = c ? 0 : DIMS.TABBAR + DIMS.BAR;
  return { x: R, y: T, width: Math.max(100, w - R), height: Math.max(100, h - T) };
}
function layout() {
  for (const [k, v] of views) {
    const on = !modalOpen && k === key(state.active.net, state.active.acc);
    v.setVisible(on);
    if (on) v.setBounds(bounds());
  }
}

const cleanUA = (ua) => ua.replace(/\s?Electron\/\S+/, "").replace(/\s?tg-hub-shell\/\S+/, "");
const prepared = new Set();
// профиль для сайта, который хаб открывает внутри себя (отдельный профиль): обычный Chrome-подобный UA, разрешения
function prepGuest(partition) {
  if (prepared.has(partition)) return; prepared.add(partition);
  const ses = session.fromPartition(partition);
  ses.setUserAgent(cleanUA(ses.getUserAgent()));
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(["notifications", "media", "clipboard-sanitized-write", "fullscreen"].includes(perm)));
}
const rootOf = (h) => h.split(".").slice(-2).join(".");

// сайты (ВК и др.), которые хаб показывает внутри своей рабочей области
const netViews = new Map();   // id -> WebContentsView
let netShown = null;
function hideNets() { for (const v of netViews.values()) v.setVisible(false); netShown = null; }
const netCreds = new Map();   // id -> { url, login, pass } — только в памяти, на диск не пишем

// Подстановка логина/пароля: ищем видимые поля входа и заполняем пустые. Не нажимаем «Войти» — это за вами.
// Скрипт запускается только если страница всё ещё на домене сайта из вашего списка.
function autofill(id) {
  const c = netCreds.get(id), v = netViews.get(id); if (!c || !v || (!c.login && !c.pass)) return;
  const wc = v.webContents; if (wc.isDestroyed()) return;
  try { if (rootOf(new URL(wc.getURL()).hostname) !== rootOf(new URL(c.url).hostname)) return; } catch (e) { return; }
  const code = `(() => {
    const L = ${JSON.stringify(c.login)}, P = ${JSON.stringify(c.pass)}; let n = 0;
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 10 && getComputedStyle(e).visibility !== "hidden"; };
    const set = (e, val) => { const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value"); d.set.call(e, val); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
    const t = setInterval(() => {
      if (++n > 80) return clearInterval(t);
      const inputs = [...document.querySelectorAll("input")].filter(vis);
      const pw = inputs.find((e) => e.type === "password");
      if (P && pw && !pw.value) set(pw, P);
      if (L) {
        const lg = inputs.find((e) => e !== pw && !e.value && !/search|поиск/i.test((e.name || "") + (e.id || "") + (e.placeholder || "") + (e.getAttribute("aria-label") || "") + (e.type || "")) && (e.type === "tel" || e.type === "email" || (e.type === "text" && /user|login|phone|email|mail/i.test((e.name || "") + (e.autocomplete || "") + (e.id || "")))));
        if (lg) set(lg, L);
      }
    }, 500);
  })();`;
  wc.executeJavaScript(code).catch(() => {});
}
function showNetView({ id, url, x, y, w, h, login, pass }) {
  if (!/^[a-z0-9]{1,12}$/i.test(String(id)) || !/^https:\/\//i.test(String(url || ""))) return;
  const nums = [x, y, w, h].map(Number); if (nums.some((n) => !isFinite(n)) || nums[2] < 10 || nums[3] < 10) return;
  netCreds.set(id, { url, login: String(login || "").slice(0, 300), pass: String(pass || "").slice(0, 300) });
  const hubB = bounds();   // положение страницы хаба в окне
  let v = netViews.get(id);
  if (!v) {
    const part = "persist:net-" + id; prepGuest(part);
    v = new WebContentsView({ webPreferences: { session: session.fromPartition(part), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const wc = v.webContents;
    wc.setWindowOpenHandler(({ url: u }) => {
      try { if (rootOf(new URL(u).hostname) === rootOf(new URL(wc.getURL() || url).hostname)) wc.loadURL(u); else shell.openExternal(u); } catch (e) { /* игнор */ }
      return { action: "deny" };
    });
    wc.on("page-title-updated", (_e, title) => {
      const m = /^\((\d+)\)/.exec(title || ""); const n = m ? parseInt(m[1], 10) : 0;
      const hub = views.get(key("hub", state.networks.find((nn) => nn.id === "hub")?.accounts[0]?.id));
      if (hub && !hub.webContents.isDestroyed()) hub.webContents.send("net:badge", id, n);
    });
    wc.on("did-finish-load", () => autofill(id));
    wc.on("did-navigate-in-page", () => autofill(id));
    wc.loadURL(url).catch(() => {});
    netViews.set(id, v);
  }
  for (const [k, o] of netViews) if (k !== id) o.setVisible(false);
  win.contentView.addChildView(v);   // поднимаем наверх
  v.setBounds({ x: Math.round(hubB.x + nums[0]), y: Math.round(hubB.y + nums[1]), width: Math.round(nums[2]), height: Math.round(nums[3]) });
  v.setVisible(true); netShown = id;
}
ipcMain.on("net:show", (e, o) => { if (isHubSender(e)) showNetView(o || {}); });
ipcMain.on("net:hide", (e) => { if (isHubSender(e)) hideNets(); });
ipcMain.on("net:nav", (e, { action, url } = {}) => {
  if (!isHubSender(e) || !netShown) return; const wc = netViews.get(netShown)?.webContents; if (!wc) return;
  if (action === "back" && wc.canGoBack()) wc.goBack(); else if (action === "forward" && wc.canGoForward()) wc.goForward();
  else if (action === "reload") wc.reload(); else if (action === "home" && /^https:\/\//i.test(String(url || ""))) wc.loadURL(url).catch(() => {});
});
ipcMain.on("net:remove", (e, id) => {
  if (!isHubSender(e)) return; const v = netViews.get(String(id)); if (!v) return;
  try { win.contentView.removeChildView(v); v.webContents.close(); } catch (er) { /* игнор */ }
  netViews.delete(String(id)); netCreds.delete(String(id)); if (netShown === id) netShown = null;
});
function isHubSender(e) { for (const v of views.values()) if (v.webContents === e.sender) return true; return false; }

function ensureView(netId, accId) {
  const k = key(netId, accId);
  if (views.has(k)) return views.get(k);
  const net = findNet(netId); if (!net) return null;
  const ses = session.fromPartition("persist:" + k);
  // обычный Chrome-подобный user-agent: многие сайты (VK, WhatsApp Web) не любят «Electron»
  const isHub = netId === "hub";   // страница хаба узнаёт приложение по метке в user-agent и открывает сайты у себя внутри
  ses.setUserAgent(cleanUA(ses.getUserAgent()) + (isHub ? " TGHubShell/1" : ""));
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(["notifications", "media", "clipboard-sanitized-write", "fullscreen"].includes(perm)));
  const v = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: isHub ? path.join(__dirname, "preload-hub.js") : undefined } });
  const wc = v.webContents;
  if (isHub) {
    // при перезагрузке/переходе страницы хаба прячем встроенные сайты (их снова покажет хаб)
    wc.on("did-start-loading", hideNets);
  }
  // ссылки: свой сайт открываем здесь, чужие — в обычном браузере
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const host = new URL(url).hostname, base = new URL(net.url).hostname;
      const root = (h) => h.split(".").slice(-2).join(".");
      if (root(host) === root(base)) wc.loadURL(url); else shell.openExternal(url);
    } catch (e) { /* игнор */ }
    return { action: "deny" };
  });
  // счётчик из заголовка вкладки вида «(3) …» — у большинства сайтов так
  wc.on("page-title-updated", (_e, title) => {
    const m = /^\((\d+)\)/.exec(title || "");
    const n = m ? parseInt(m[1], 10) : 0;
    if (badges[k] !== n) { badges[k] = n; pushBadges(); }
  });
  wc.loadURL(net.url).catch(() => {});
  win.contentView.addChildView(v);
  views.set(k, v);
  return v;
}
function destroyView(k) {
  const v = views.get(k); if (!v) return;
  try { win.contentView.removeChildView(v); v.webContents.close(); } catch (e) { /* игнор */ }
  views.delete(k); delete badges[k];
}
function select(netId, accId) {
  const net = findNet(netId); if (!net) return;
  const acc = net.accounts.find((a) => a.id === accId) || net.accounts[0];
  state.active = { net: netId, acc: acc ? acc.id : "" };
  if (acc) ensureView(netId, acc.id);
  layout(); save(); pushState();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 760, minHeight: 480, title: "TG Hub Shell", backgroundColor: "#0b0e14",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "ui.html"));
  win.on("resize", () => { layout(); });
  win.webContents.once("did-finish-load", () => select(state.active.net, state.active.acc));
}

ipcMain.handle("getState", () => ({ state, badges }));
ipcMain.handle("select", (_e, { net, acc }) => select(net, acc));
ipcMain.handle("modal", (_e, open) => { modalOpen = !!open; layout(); });
ipcMain.handle("addAccount", (_e, { net, name }) => {
  const n = findNet(net); if (!n) return;
  const a = { id: uid(), name: (name || "").trim() || "Аккаунт " + (n.accounts.length + 1) };
  n.accounts.push(a); select(net, a.id);
});
ipcMain.handle("renameAccount", (_e, { net, acc, name }) => {
  const a = findNet(net)?.accounts.find((x) => x.id === acc); if (a && name.trim()) { a.name = name.trim(); save(); pushState(); }
});
ipcMain.handle("removeAccount", (_e, { net, acc }) => {
  const n = findNet(net); if (!n || n.accounts.length <= 1) return;   // последнюю вкладку не удаляем
  n.accounts = n.accounts.filter((a) => a.id !== acc); destroyView(key(net, acc));
  session.fromPartition("persist:" + key(net, acc)).clearStorageData().catch(() => {});   // забываем вход
  select(net, n.accounts[0].id);
});
ipcMain.handle("addNetwork", (_e, { label, name, url }) => {
  let u = (url || "").trim(); if (!u) return;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const n = { id: uid(), label: (label || name || "?").trim().slice(0, 3), name: (name || label || u).trim(), url: u, accounts: [{ id: uid(), name: "Основной" }] };
  state.networks.push(n); select(n.id, n.accounts[0].id);
});
ipcMain.handle("editNetwork", (_e, { id, label, name, url }) => {
  const n = findNet(id); if (!n) return;
  if (label) n.label = label.trim().slice(0, 3); if (name) n.name = name.trim();
  if (url) { let u = url.trim(); if (!/^https?:\/\//i.test(u)) u = "https://" + u; if (u !== n.url) { n.url = u; for (const a of n.accounts) views.get(key(id, a.id))?.webContents.loadURL(u).catch(() => {}); } }
  save(); pushState();
});
ipcMain.handle("removeNetwork", (_e, id) => {
  if (state.networks.length <= 1) return;
  const n = findNet(id); if (!n) return;
  for (const a of n.accounts) { destroyView(key(id, a.id)); session.fromPartition("persist:" + key(id, a.id)).clearStorageData().catch(() => {}); }
  state.networks = state.networks.filter((x) => x.id !== id);
  const f = state.networks[0]; select(f.id, f.accounts[0].id);
});
ipcMain.handle("nav", (_e, action) => {
  const v = views.get(key(state.active.net, state.active.acc)); if (!v) return;
  const wc = v.webContents, net = findNet(state.active.net);
  if (action === "back" && wc.canGoBack()) wc.goBack();
  else if (action === "forward" && wc.canGoForward()) wc.goForward();
  else if (action === "reload") wc.reload();
  else if (action === "home" && net) wc.loadURL(net.url).catch(() => {});
});

app.whenReady().then(() => { load(); createWindow(); });
app.on("window-all-closed", () => app.quit());
