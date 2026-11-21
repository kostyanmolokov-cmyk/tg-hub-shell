let S = null, B = {};
const $ = (s) => document.querySelector(s);
const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };

function draw() {
  if (!S) return;
  document.body.classList.toggle("compact", S.networks.length === 1 && S.networks[0].accounts.length === 1);
  const rail = $("#rail"); rail.innerHTML = "";
  for (const n of S.networks) {
    const b = el("button", "nb" + (n.id === S.active.net ? " on" : ""), n.label); b.title = n.name + " (правый клик — настройки сети)";
    const sum = n.accounts.reduce((t, a) => t + (B[n.id + ":" + a.id] || 0), 0);
    if (sum) b.append(el("span", "bd", sum > 99 ? "99+" : sum));
    b.onclick = () => shell.select(n.id, n.id === S.active.net ? S.active.acc : n.accounts[0].id);
    b.oncontextmenu = (e) => { e.preventDefault(); editNetModal(n); };
    rail.append(b);
  }
  const add = el("button", "nb", "+"); add.title = "Добавить сеть или сайт"; add.onclick = addNetModal; rail.append(add);

  const net = S.networks.find((n) => n.id === S.active.net) || S.networks[0];
  $("#nname").textContent = net.name;
  const tabs = $("#tabs"); tabs.innerHTML = "";
  for (const a of net.accounts) {
    const t = el("div", "tab" + (a.id === S.active.acc ? " on" : ""), a.name);
    const c = B[net.id + ":" + a.id]; if (c) t.append(el("span", "bd", c)), t.lastChild.style.cssText = "position:static";
    t.title = "Двойной щелчок — переименовать";
    t.onclick = () => shell.select(net.id, a.id);
    t.ondblclick = () => nameModal("Переименовать вкладку", a.name, (v) => shell.renameAccount(net.id, a.id, v));
    if (net.accounts.length > 1) { const x = el("span", "x", "✕"); x.title = "Закрыть вкладку и забыть вход"; x.onclick = (e) => { e.stopPropagation(); confirmModal("Закрыть «" + a.name + "»? Вход в этом аккаунте на сайте будет забыт.", () => shell.removeAccount(net.id, a.id)); }; t.append(x); }
    tabs.append(t);
  }
  const plus = el("div", "tab", "+"); plus.title = "Ещё один аккаунт этой сети";
  plus.onclick = () => nameModal("Новый аккаунт в «" + net.name + "»", "", (v) => shell.addAccount(net.id, v));
  tabs.append(plus);
}

function openModal(build) { shell.modal(true); const b = $("#box"); b.innerHTML = ""; build(b); $("#mod").style.display = "flex"; const i = b.querySelector("input"); if (i) i.focus(); }
function closeModal() { $("#mod").style.display = "none"; shell.modal(false); }
function field(box, label, val, ph) { box.append(el("label", "", label)); const i = el("input"); i.value = val || ""; if (ph) i.placeholder = ph; box.append(i); return i; }
function buttons(box, okText, onOk, extra) {
  const r = el("div", "row");
  if (extra) r.append(extra);
  const c = el("button", "", "Отмена"); c.onclick = closeModal;
  const o = el("button", "pri", okText); o.onclick = () => { onOk(); closeModal(); };
  r.append(c, o); box.append(r);
}
function nameModal(title, val, cb) { openModal((b) => { b.append(el("h3", "", title)); const i = field(b, "Название", val); i.onkeydown = (e) => { if (e.key === "Enter") { cb(i.value); closeModal(); } }; buttons(b, "Готово", () => cb(i.value)); }); }
function confirmModal(text, cb) { openModal((b) => { b.append(el("h3", "", text)); buttons(b, "Да", cb); }); }
function addNetModal() {
  openModal((b) => {
    b.append(el("h3", "", "Добавить сайт или сеть"));
    const nm = field(b, "Название", "", "Одноклассники"), lb = field(b, "Метка (до 3 букв)", "", "OK"), u = field(b, "Адрес", "", "ok.ru/messages");
    buttons(b, "Добавить", () => shell.addNetwork({ name: nm.value, label: lb.value, url: u.value }));
  });
}
function editNetModal(n) {
  openModal((b) => {
    b.append(el("h3", "", "Сеть «" + n.name + "»"));
    const nm = field(b, "Название", n.name), lb = field(b, "Метка", n.label), u = field(b, "Адрес", n.url);
    const del = el("button", "dan", "Удалить"); del.onclick = () => { closeModal(); confirmModal("Удалить сеть «" + n.name + "» со всеми вкладками?", () => shell.removeNetwork(n.id)); };
    buttons(b, "Сохранить", () => shell.editNetwork({ id: n.id, name: nm.value, label: lb.value, url: u.value }), del);
  });
}

$("#back").onclick = () => shell.nav("back");
$("#fwd").onclick = () => shell.nav("forward");
$("#reload").onclick = () => shell.nav("reload");
$("#home").onclick = () => shell.nav("home");
shell.onState((s) => { S = s; draw(); });
shell.onBadges((b) => { B = b; draw(); });
shell.getState().then(({ state, badges }) => { S = state; B = badges; draw(); });
