// Мост между страницей хаба и расширением. Работает только на странице хаба (см. manifest).
document.documentElement.dataset.tgExt = chrome.runtime.getManifest().version;
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data; if (!d || typeof d !== "object" || !d.tgHubExt) return;
  if (d.tgHubExt === "sites" && Array.isArray(d.urls)) chrome.runtime.sendMessage({ type: "sites", urls: d.urls.slice(0, 100).map(String) }).catch(() => {});
  if (d.tgHubExt === "nav" && (d.action === "back" || d.action === "forward")) chrome.runtime.sendMessage({ type: "nav", url: String(d.url || ""), action: d.action }).catch(() => {});
  if (d.tgHubExt === "fill") chrome.runtime.sendMessage({ type: "fill", url: String(d.url || ""), login: String(d.login || "").slice(0, 300), pass: String(d.pass || "").slice(0, 300) }).catch(() => {});
});
