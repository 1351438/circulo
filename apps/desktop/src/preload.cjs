const { contextBridge, ipcRenderer } = require("electron");

function syncTitleBarTheme() {
  const root = document.documentElement;
  if (!root) return;

  ipcRenderer.send(
    "circulo:titlebar-theme",
    root.classList.contains("dark") ? "dark" : "light",
  );
}

function installDesktopDocumentState() {
  const root = document.documentElement;
  if (!root) return;

  root.dataset.circuloDesktop = "true";
  const themeObserver = new MutationObserver(syncTitleBarTheme);
  themeObserver.observe(root, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncTitleBarTheme();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installDesktopDocumentState, {
    once: true,
  });
} else {
  installDesktopDocumentState();
}

contextBridge.exposeInMainWorld("circuloDesktop", {
  controlsSide: process.platform === "darwin" ? "left" : "right",
  runtimeInfo: () => ipcRenderer.invoke("circulo:runtime-info"),
  getNavigationState: () => ipcRenderer.invoke("circulo:navigation-state"),
  onNavigationState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("circulo:navigation-state", handler);
    return () =>
      ipcRenderer.removeListener("circulo:navigation-state", handler);
  },
  navigateBack: () => ipcRenderer.send("circulo:navigate-back"),
  navigateForward: () => ipcRenderer.send("circulo:navigate-forward"),
  onRuntimeStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("circulo:runtime-status", handler);
    return () => ipcRenderer.removeListener("circulo:runtime-status", handler);
  },
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("circulo:update-status", handler);
    return () => ipcRenderer.removeListener("circulo:update-status", handler);
  },
  downloadUpdate: () => ipcRenderer.invoke("circulo:download-update"),
  installUpdate: () => ipcRenderer.invoke("circulo:install-update"),
  isDesktop: true,
});
