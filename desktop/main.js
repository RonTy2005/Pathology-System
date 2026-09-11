const { app, BrowserWindow, dialog, ipcMain, net, powerMonitor } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs/promises");
const path = require("path");
const { createMandatoryUpdateController } = require("./mandatoryUpdateController");

const INITIAL_UPDATE_CHECK_DELAY_MS = 20 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

const appRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");
const packageMetadata = require(path.join(appRoot, "package.json"));
const commandLineMode = process.argv.includes("--server")
  ? "server"
  : (process.argv.includes("--client") ? "client" : null);
const appMode = commandLineMode || packageMetadata.labLmsMode || "client";
const desktopProductName = appMode === "server" ? "LabShield Server" : "LabShield";

let mainWindow;
let serverInstance;
let retryTimer;
let updateCheckTimer;
let delayedUpdateCheckTimer;
let updateCheckInProgress = false;
let mandatoryUpdateController;
let connectionStatus = {
  phase: "starting",
  message: "Preparing LabShield…",
  servers: [],
};

function clearAutomaticUpdateTimers() {
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (delayedUpdateCheckTimer) clearTimeout(delayedUpdateCheckTimer);
  updateCheckTimer = null;
  delayedUpdateCheckTimer = null;
}

async function checkForDesktopUpdate() {
  if (updateCheckInProgress || (typeof net.isOnline === "function" && !net.isOnline())) return;

  updateCheckInProgress = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    // Updates are optional while offline. Keep the desktop app usable and retry later.
    console.warn("Automatic update check failed:", error?.message || error);
  } finally {
    updateCheckInProgress = false;
  }
}

function scheduleAutomaticUpdateCheck(delay = INITIAL_UPDATE_CHECK_DELAY_MS) {
  if (delayedUpdateCheckTimer) clearTimeout(delayedUpdateCheckTimer);
  delayedUpdateCheckTimer = setTimeout(() => {
    delayedUpdateCheckTimer = null;
    void checkForDesktopUpdate();
  }, delay);
}

function startAutomaticUpdates() {
  // Development launches have no release metadata. Packaged Windows apps
  // obtain their mode-specific channel from electron-builder's app-update.yml.
  if (!app.isPackaged || process.platform !== "win32") return;

  mandatoryUpdateController = createMandatoryUpdateController({
    autoUpdater,
    dialog,
    getWindow: () => mainWindow,
    appMode,
    productName: desktopProductName,
  });
  mandatoryUpdateController.start();

  scheduleAutomaticUpdateCheck();
  updateCheckTimer = setInterval(() => void checkForDesktopUpdate(), UPDATE_CHECK_INTERVAL_MS);
  powerMonitor.on("resume", () => {
    mandatoryUpdateController?.enforceDeadline();
    scheduleAutomaticUpdateCheck();
  });
}

function getConnectionPath() {
  return path.join(app.getPath("userData"), "server-connection.json");
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function prepareServerDatabase() {
  const dataDirectory = app.getPath("userData");
  const databasePath = path.join(dataDirectory, "lab-lms.db");
  if (await pathExists(databasePath)) return;

  // Preserve data from an earlier Lab LMS Server installation when upgrading
  // to the renamed LabShield desktop application.
  const legacyDatabasePath = path.join(app.getPath("appData"), "Lab LMS Server", "lab-lms.db");
  const packagedCataloguePath = path.join(process.resourcesPath || appRoot, "labshield-catalogue.db");
  const seedSource = (await pathExists(legacyDatabasePath))
    ? legacyDatabasePath
    : ((await pathExists(packagedCataloguePath)) ? packagedCataloguePath : null);

  if (!seedSource) return;

  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.copyFile(seedSource, databasePath);
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
    throw new Error("That LabShield server could not be reached. Check the address and LAN connection.");
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
    message: "Searching this local network for the LabShield server…",
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
      message: "More than one LabShield server was found. Choose the central server for this installation.",
      servers,
    });
    return null;
  }

  publishConnectionStatus({
    phase: "not-found",
    message: "No LabShield server was found yet. Keep the server PC on and connected to this same private LAN; this app will keep retrying automatically.",
    servers: [],
  });
  scheduleRetry();
  return null;
}

async function startLocalServer() {
  await prepareServerDatabase();
  process.env.LAB_LMS_APP_ROOT = appRoot;
  process.env.LAB_LMS_DATA_DIR = app.getPath("userData");

  const { bootstrap } = require(path.join(appRoot, "server.js"));
  serverInstance = await bootstrap();
  const localUrl = "http://127.0.0.1:3000";
  publishConnectionStatus({ phase: "starting", message: "Starting the central LabShield server…" });

  const { isLabServer } = require(path.join(appRoot, "src", "services", "lanClientDiscovery"));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isLabServer(localUrl, 800)) {
      await mainWindow.loadURL(`${localUrl}/login.html`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("The central LabShield server did not become ready.");
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
  app.setName(desktopProductName);
  createMainWindow();
  await mainWindow.loadFile(path.join(__dirname, "connecting.html"));
  startAutomaticUpdates();

  try {
    if (appMode === "server") {
      await startLocalServer();
    } else {
      await connectToLanServer();
    }
  } catch (error) {
    publishConnectionStatus({
      phase: "error",
      message: error.message || "LabShield could not start.",
      servers: [],
    });
    await dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "LabShield could not start",
      message: error.message || "An unexpected error occurred.",
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  clearRetryTimer();
  clearAutomaticUpdateTimers();
  mandatoryUpdateController?.stop();
  serverInstance?.labLmsDiscovery?.stop?.();
  serverInstance?.close?.();
});
