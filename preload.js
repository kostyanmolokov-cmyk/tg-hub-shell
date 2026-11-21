const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("shell", {
  getState: () => ipcRenderer.invoke("getState"),
  select: (net, acc) => ipcRenderer.invoke("select", { net, acc }),
  addAccount: (net, name) => ipcRenderer.invoke("addAccount", { net, name }),
  renameAccount: (net, acc, name) => ipcRenderer.invoke("renameAccount", { net, acc, name }),
  removeAccount: (net, acc) => ipcRenderer.invoke("removeAccount", { net, acc }),
  addNetwork: (n) => ipcRenderer.invoke("addNetwork", n),
  editNetwork: (n) => ipcRenderer.invoke("editNetwork", n),
  removeNetwork: (id) => ipcRenderer.invoke("removeNetwork", id),
  nav: (action) => ipcRenderer.invoke("nav", action),
  modal: (open) => ipcRenderer.invoke("modal", open),
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onBadges: (cb) => ipcRenderer.on("badges", (_e, b) => cb(b)),
});
