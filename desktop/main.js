const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const appRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");
const packageMetadata = require(path.join(appRoot, "package.json"));
const commandLineMode = process.argv.includes("--server")
  ? "server"
  : (process.argv.includes("--client") ? "client" : null);
const appMode = commandLineMode || packageMetadata.labLmsMode || "client";

let mainWindow;
let serverInstance;
let retryTimer;
let connectionStatus = {
  phase: "starting",
  message: "Preparing Lab LMS…",
  servers: [],
};

function getConnectionPath() {
  return path.join(app.getPath("userData"), "server-connection.json");
}

async function readSavedServerUrl() {
  try {
    const saved = JSON.parse(await fs.readFile(getConnectionPath(), "utf8"));
    return saved?.serverUrl || null;
  } catch (_error) {
    return null;
  }
}

async function saveServerUrl(serverUrl) {
  await fs.mkdir(path.dirname(getConnectionPath()), { recursive: true });
  await fs.writeFile(
    getConnectionPath(),
    JSON.stringify({ serverUrl, savedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function publishConnectionStatus(nextStatus) {
  connectionStatus = { ...connectionStatus, ...nextStatus };
  mainWindow?.webContents.send("lab-lms:connection-changed", connectionStatus);
}

function clearRetryTimer() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  clearRetryTimer();
  retryTimer = setTimeout(() => connectToLanServer(), 8000);
}

async function loadConnectingScreen() {
  if (!mainWindow || mainWindow.webContents.getURL().startsWith("file:")) return;
  await mainWindow.loadFile(path.join(__dirname, "connecting.html"));
}

async function useServer(serverUrl) {
  const { isLabServer, normalizeServerUrl } = require(path.join(appRoot, "src", "services", "lanClientDiscovery"));
  const normalizedUrl = normalizeServerUrl(serverUrl);
  if (!normalizedUrl || !(await isLabServer(normalizedUrl))) {
    throw new Error("That Lab LMS server could not be reached. Check the address and LAN connection.");
  }

  clearRetryTimer();
  await saveServerUrl(normalizedUrl);
  publishConnectionStatus({
    phase: "connected",
    message: `Connected to ${normalizedUrl}`,
    servers: [normalizedUrl],
  });
  await mainWindow.loadURL(`${normalizedUrl}/login.html`);
  return normalizedUrl;
}

async function connectToLanServer({ forceDiscovery = false } = {}) {
  if (appMode !== "client") return null;

  await loadConnectingScreen();
  publishConnectionStatus({
    phase: "searching",
    message: "Searching this local network for the Lab LMS server…",
    servers: [],
  });

  const { discoverLabServers, isLabServer } = require(path.join(appRoot, "src", "services", "lanClientDiscovery"));
  const savedServerUrl = forceDiscovery ? null : await readSavedServerUrl();
  if (savedServerUrl && await isLabServer(savedServerUrl)) {
    return useServer(savedServerUrl);
  }

  const servers = await discoverLabServers();
  if (servers.length === 1) return useServer(servers[0]);

  if (servers.length > 1) {
    publishConnectionStatus({
      phase: "choose-server",
      message: "More than one Lab LMS server was found. Choose the central server for this installation.",
      servers,
    });
    return null;
  }

  publishConnectionStatus({
    phase: "not-found",
    message: "No Lab LMS server was found yet. Keep the server PC on and connected to this same private LAN; this app will keep retrying automatically.",
    servers: [],
  });
  scheduleRetry();
  return null;
}

async function startLocalServer() {
  process.env.LAB_LMS_APP_ROOT = appRoot;
  process.env.LAB_LMS_DATA_DIR = app.getPath("userData");

  const { bootstrap } = require(path.join(appRoot, "server.js"));
  serverInstance = await bootstrap();
  const localUrl = "http://127.0.0.1:3000";
  publishConnectionStatus({ phase: "starting", message: "Starting the central Lab LMS server…" });

  const { isLabServer } = require(path.join(appRoot, "src", "services", "lanClientDiscovery"));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isLabServer(localUrl, 800)) {
      await mainWindow.loadURL(`${localUrl}/login.html`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("The central server did not become ready.");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 320,
    minHeight: 500,
    show: false,
    backgroundColor: "#f4f8f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

ipcMain.handle("lab-lms:connection-status", () => connectionStatus);
ipcMain.handle("lab-lms:retry-connection", () => connectToLanServer({ forceDiscovery: true }));
ipcMain.handle("lab-lms:use-server", async (_event, serverUrl) => useServer(serverUrl));

app.whenReady().then(async () => {
  createMainWindow();
  await mainWindow.loadFile(path.join(__dirname, "connecting.html"));

  try {
    if (appMode === "server") {
      await startLocalServer();
    } else {
      await connectToLanServer();
    }
  } catch (error) {
    publishConnectionStatus({
      phase: "error",
      message: error.message || "Lab LMS could not start.",
      servers: [],
    });
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Lab LMS could not start",
      message: error.message || "An unexpected error occurred.",
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  clearRetryTimer();
  serverInstance?.labLmsDiscovery?.stop?.();
  serverInstance?.close?.();
});
