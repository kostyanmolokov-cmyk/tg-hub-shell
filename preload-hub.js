const { contextBridge, ipcRenderer } = require("electron");
// мост для страницы хаба: показать сайт (ВК и т. д.) в указанном прямоугольнике окна
contextBridge.exposeInMainWorld("tgShell", {
  v: 2,
  showNet: (o) => ipcRenderer.send("net:show", o),
  hideNets: () => ipcRenderer.send("net:hide"),
  nav: (o) => ipcRenderer.send("net:nav", o),
  removeNet: (id) => ipcRenderer.send("net:remove", id),
  onBadge: (cb) => ipcRenderer.on("net:badge", (_e, id, n) => cb(id, n)),
});
