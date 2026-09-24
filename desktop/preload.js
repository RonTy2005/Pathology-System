const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("labLmsConnection", {
  getStatus: () => ipcRenderer.invoke("lab-lms:connection-status"),
  retry: () => ipcRenderer.invoke("lab-lms:retry-connection"),
  useServer: (serverUrl) => ipcRenderer.invoke("lab-lms:use-server", serverUrl),
  onStatusChanged: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("lab-lms:connection-changed", handler);
    return () => ipcRenderer.removeListener("lab-lms:connection-changed", handler);
  },
});

contextBridge.exposeInMainWorld("labLmsDesktop", {
  saveReportPdf: (html, fileName) => ipcRenderer.invoke("lab-lms:save-report-pdf", { html, fileName }),
  saveBillPdf: (html, fileName) => ipcRenderer.invoke("lab-lms:save-report-pdf", { html, fileName, kind: "bill" }),
});
