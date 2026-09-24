const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { ONE_HOUR_MS, createMandatoryUpdateController } = require("../desktop/mandatoryUpdateController");
const { ensureAutomaticStartup } = require("../desktop/automaticStartup");
const { createServerAvailabilityGuard } = require("../desktop/serverAvailability");
const { getInitialWindowBounds } = require("../desktop/windowSizing");
const packageMetadata = require("../package.json");
const fs = require("node:fs");
const path = require("node:path");

function loadBuilderConfig({ mode, family, arch }) {
  const configPath = require.resolve("../desktop/electron-builder.config.cjs");
  const original = {
    mode: process.env.LAB_LMS_BUILD_MODE,
    family: process.env.LAB_LMS_WINDOWS_FAMILY,
    arch: process.env.LAB_LMS_BUILD_ARCH,
  };
  process.env.LAB_LMS_BUILD_MODE = mode;
  if (family) process.env.LAB_LMS_WINDOWS_FAMILY = family;
  else delete process.env.LAB_LMS_WINDOWS_FAMILY;
  if (arch) process.env.LAB_LMS_BUILD_ARCH = arch;
  else delete process.env.LAB_LMS_BUILD_ARCH;
  delete require.cache[configPath];
  const config = require(configPath);
  if (original.mode === undefined) delete process.env.LAB_LMS_BUILD_MODE;
  else process.env.LAB_LMS_BUILD_MODE = original.mode;
  if (original.family === undefined) delete process.env.LAB_LMS_WINDOWS_FAMILY;
  else process.env.LAB_LMS_WINDOWS_FAMILY = original.family;
  if (original.arch === undefined) delete process.env.LAB_LMS_BUILD_ARCH;
  else process.env.LAB_LMS_BUILD_ARCH = original.arch;
  delete require.cache[configPath];
  return config;
}

function fixture({ appMode = "client", promptResponse = 1 } = {}) {
  let clock = 1_700_000_000_000;
  let nextTimerId = 0;
  const timers = new Map();
  const updater = new EventEmitter();
  updater.quitAndInstallCalls = [];
  updater.quitAndInstall = (...args) => updater.quitAndInstallCalls.push(args);
  const dialog = {
    calls: [],
    async showMessageBox(windowOrOptions, maybeOptions) {
      const options = maybeOptions || windowOrOptions;
      dialog.calls.push(options);
      return { response: promptResponse };
    },
  };
  const controller = createMandatoryUpdateController({
    autoUpdater: updater,
    dialog,
    appMode,
    now: () => clock,
    setTimer: (callback, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
    log: { info() {}, warn() {} },
  });
  return {
    controller, updater, dialog, timers,
    advance: milliseconds => { clock += milliseconds; },
    fireDeadline: () => [...timers.values()][0]?.callback(),
  };
}

test("downloaded updates prompt once, set a one-hour deadline and install when deferred", async () => {
  const f = fixture();
  f.controller.start();
  assert.equal(f.updater.autoDownload, true);
  assert.equal(f.updater.autoInstallOnAppQuit, true);
  assert.equal(f.updater.autoRunAppAfterInstall, true);
  f.updater.emit("update-downloaded", { version: "1.2.0" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dialog.calls.length, 1);
  assert.match(f.dialog.calls[0].detail, /within 1 hour/);
  assert.deepEqual(f.dialog.calls[0].buttons, ["Restart and update now", "Later"]);
  assert.equal(f.controller.getState().remainingMs, ONE_HOUR_MS);
  assert.equal([...f.timers.values()][0].delay, ONE_HOUR_MS);

  f.updater.emit("update-downloaded", { version: "1.2.0" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dialog.calls.length, 1, "repeat download events do not repeatedly prompt");
  f.advance(ONE_HOUR_MS);
  f.fireDeadline();
  assert.deepEqual(f.updater.quitAndInstallCalls, [[true, true]]);
  assert.equal(f.controller.enforceDeadline(), false, "installation is only started once");
});

test("Update now installs immediately; server updates retain their Windows elevation prompt", async () => {
  const client = fixture({ promptResponse: 0 });
  client.controller.start();
  client.updater.emit("update-downloaded", { version: "1.2.1" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(client.updater.quitAndInstallCalls, [[true, true]]);

  const server = fixture({ appMode: "server", promptResponse: 0 });
  server.controller.start();
  server.updater.emit("update-downloaded", { version: "1.2.1" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(server.updater.quitAndInstallCalls, [[false, true]]);
});

test("a resumed computer installs an overdue downloaded update immediately", async () => {
  const f = fixture();
  f.controller.start();
  f.updater.emit("update-downloaded", { version: "1.2.2" });
  await new Promise(resolve => setImmediate(resolve));
  f.advance(ONE_HOUR_MS + 1);
  assert.equal(f.controller.enforceDeadline(), true);
  assert.deepEqual(f.updater.quitAndInstallCalls, [[true, true]]);
});

test("temporary client health-check failures do not replace or reload the current workspace", () => {
  const mainSource = fs.readFileSync(path.resolve(__dirname, "../desktop/main.js"), "utf8");
  const healthCheck = mainSource.match(/function startClientHealthCheck\(serverUrl\) \{[\s\S]*?\n\}(?=\s*async function loadConnectingScreen)/)?.[0];
  assert.ok(healthCheck);
  assert.match(healthCheck, /phase: "offline"/);
  assert.doesNotMatch(healthCheck, /scheduleRetry|loadFile|loadURL|connectedServerUrl = null/);
  assert.match(mainSource, /if \(appMode === "client" && !connectedServerUrl\) scheduleRetry\(1500\)/);
  assert.match(mainSource, /webContents\.on\("did-fail-load"/);

  const commonSource = fs.readFileSync(path.resolve(__dirname, "../frontend/scripts/common.js"), "utf8");
  assert.match(commonSource, /function showDesktopConnectionStatus\(status\)/);
  assert.match(commonSource, /if \(status\?\.phase !== "offline"\)/);
  assert.match(commonSource, /document\.documentElement\.classList\.add\("labshield-desktop"\)/);
  const css = fs.readFileSync(path.resolve(__dirname, "../frontend/styles/app.css"), "utf8");
  assert.match(css, /\.labshield-desktop \.panel,[\s\S]*?backdrop-filter: none;/);
  assert.match(css, /\.labshield-desktop \.scrollable-list,[\s\S]*?#testList,[\s\S]*?will-change: auto;\s*transform: none;/);
});

test("server startup never shows address discovery and clients try their saved server first", () => {
  const mainSource = fs.readFileSync(path.resolve(__dirname, "../desktop/main.js"), "utf8");
  assert.match(mainSource, /appMode === "server" \? "server-starting\.html" : "connecting\.html"/);
  const serverStartup = fs.readFileSync(path.resolve(__dirname, "../desktop/server-starting.html"), "utf8");
  assert.match(serverStartup, /Starting the laboratory server/);
  assert.doesNotMatch(serverStartup, /Search again|Enter server address|serverChoices/);

  const clientConnect = mainSource.match(/async function connectToLanServer\([\s\S]*?\n\}(?=\s*async function startLocalServer)/)?.[0];
  assert.ok(clientConnect);
  assert.ok(clientConnect.indexOf("readSavedServerUrl()") < clientConnect.indexOf("phase: \"searching\""));
  assert.match(clientConnect, /useServer\(savedServerUrl, \{ alreadyVerified: true \}\)/);
  assert.match(clientConnect, /if \(servers\.length === 1\) return useServer\(servers\[0\], \{ alreadyVerified: true \}\)/);
});

test("Windows 7 and 32-bit installers use compatible runtimes and isolated update channels", () => {
  assert.match(packageMetadata.scripts["build:server-installer"], /--publish never/);
  assert.match(packageMetadata.scripts["build:client-installer"], /--publish never/);
  const modern = loadBuilderConfig({ mode: "server" });
  assert.equal(modern.electronVersion, undefined);
  assert.equal(modern.publish[0].channel, "server");
  assert.equal(modern.win.artifactName, "LabShield-Server-Setup-${version}-win10-x64.${ext}");
  assert.deepEqual(modern.win.target[0].arch, ["x64"]);
  assert.equal(modern.nsis.deleteAppDataOnUninstall, false, "upgrades and reinstalls must preserve clinical AppData");

  const serverX64 = loadBuilderConfig({ mode: "server", family: "win7", arch: "x64" });
  assert.equal(serverX64.electronVersion, "22.3.27");
  assert.equal(serverX64.publish[0].channel, "server-win7-x64");
  assert.equal(serverX64.win.artifactName, "LabShield-Server-Setup-${version}-win7-x64.${ext}");
  assert.deepEqual(serverX64.win.target[0].arch, ["x64"]);

  const clientX86 = loadBuilderConfig({ mode: "client", family: "win7", arch: "ia32" });
  assert.equal(clientX86.electronVersion, "22.3.27");
  assert.equal(clientX86.publish[0].channel, "client-win7-x86");
  assert.equal(clientX86.win.artifactName, "LabShield-Client-Setup-${version}-win7-x86.${ext}");
  assert.deepEqual(clientX86.win.target[0].arch, ["ia32"]);
  assert.equal(clientX86.nsis.deleteAppDataOnUninstall, false);
});

test("packaged Windows server and client apps enforce visible automatic startup", () => {
  const calls = [];
  const shortcuts = [];
  const startupFolders = [];
  const executablePath = "C:\\Program Files\\LabShield\\LabShield.exe";
  const app = {
    isPackaged: true,
    getPath: name => name === "appData" ? "C:\\Users\\Lab\\AppData\\Roaming" : null,
    setLoginItemSettings: settings => calls.push(settings),
    getLoginItemSettings: () => ({ openAtLogin: true }),
  };
  const shell = {
    readShortcutLink: () => { throw new Error("Shortcut not found"); },
    writeShortcutLink: (...args) => { shortcuts.push(args); return true; },
  };
  const fileSystem = { mkdirSync: (...args) => startupFolders.push(args) };
  const result = ensureAutomaticStartup({
    app, shell, fileSystem, pathModule: path.win32,
    platform: "win32",
    executablePath,
  });
  assert.equal(result.configured, true);
  assert.equal(result.loginItemConfigured, true);
  assert.equal(result.shortcutConfigured, true);
  assert.deepEqual(calls, [{
    openAtLogin: true,
    enabled: true,
    name: "LabShield",
    path: executablePath,
  }]);
  assert.equal(shortcuts.length, 1);
  assert.equal(shortcuts[0][0], "C:\\Users\\Lab\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\LabShield.lnk");
  assert.equal(shortcuts[0][1], "create");
  assert.deepEqual(shortcuts[0][2], {
    target: executablePath,
    cwd: "C:\\Program Files\\LabShield",
    args: "--autostart",
    description: "LabShield starts when this Windows user signs in",
  });
  assert.equal(startupFolders.length, 1);

  const disabledRun = ensureAutomaticStartup({
    app: { ...app, getLoginItemSettings: () => ({ openAtLogin: true, executableWillLaunchAtLogin: false }) },
    shell, fileSystem, pathModule: path.win32, platform: "win32", executablePath,
    logger: { warn() {} },
  });
  assert.equal(disabledRun.loginItemConfigured, false);
  assert.equal(disabledRun.shortcutConfigured, true, "the current-user Startup shortcut repairs a disabled Run entry");

  const existingShortcut = ensureAutomaticStartup({
    app, fileSystem, pathModule: path.win32, platform: "win32", executablePath,
    shell: { readShortcutLink: () => ({ target: executablePath, args: "--autostart" }), writeShortcutLink: () => { throw new Error("unnecessary rewrite"); } },
  });
  assert.equal(existingShortcut.shortcutConfigured, true);

  const server = ensureAutomaticStartup({
    app, shell, fileSystem, pathModule: path.win32, appMode: "server", platform: "win32",
    executablePath: "C:\\Program Files\\LabShield Server\\LabShield Server.exe",
  });
  assert.equal(server.settings.name, "LabShield Server");
  assert.match(server.shortcutPath, /LabShield Server\.lnk$/);

  const development = ensureAutomaticStartup({ app: { ...app, isPackaged: false }, platform: "win32" });
  assert.equal(development.configured, false);
  assert.equal(calls.length, 4, "development launches must not change Windows startup settings");

  const mainSource = fs.readFileSync(path.resolve(__dirname, "../desktop/main.js"), "utf8");
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /if \(hasSingleInstanceLock\) app\.whenReady\(\)/);
  assert.match(mainSource, /mainWindow\.once\("ready-to-show",[\s\S]*?mainWindow\?\.show\(\);[\s\S]*?mainWindow\?\.focus\(\);/);
  assert.match(mainSource, /if \(mainWindow && !mainWindow\.isDestroyed\(\) && !mainWindow\.isVisible\(\)\)/);

  for (const mode of ["server", "client"]) {
    const config = loadBuilderConfig({ mode });
    const includePath = path.resolve(__dirname, "..", config.nsis.include);
    const installerScript = fs.readFileSync(includePath, "utf8");
    assert.match(installerScript, /Windows\\CurrentVersion\\Run/);
    assert.match(installerScript, /WriteRegStr HKCU/);
    assert.match(installerScript, /DeleteRegValue HKCU/);
    if (mode === "server") {
      assert.match(installerScript, /"LabShield Server" '\"\$INSTDIR\\LabShield Server\.exe\"'/);
    } else {
      assert.match(installerScript, /"LabShield" '\"\$INSTDIR\\LabShield\.exe\"'/);
      assert.doesNotMatch(installerScript, /LabShield Server\.exe/);
    }
  }
});

test("800x600 displays receive an on-screen window and readable compact workspace", () => {
  assert.deepEqual(getInitialWindowBounds({ width: 800, height: 600 }), {
    width: 788,
    height: 588,
    minWidth: 520,
    minHeight: 440,
  });
  assert.deepEqual(getInitialWindowBounds({ width: 1920, height: 1040 }), {
    width: 1320,
    height: 860,
    minWidth: 520,
    minHeight: 440,
  });

  const mainSource = fs.readFileSync(path.resolve(__dirname, "../desktop/main.js"), "utf8");
  assert.match(mainSource, /screen\.getPrimaryDisplay\(\)\?\.workAreaSize/);
  assert.match(mainSource, /getInitialWindowBounds\(primaryWorkArea\)/);

  const css = fs.readFileSync(path.resolve(__dirname, "../frontend/styles/app.css"), "utf8");
  assert.match(css, /Low-resolution desktop layout/);
  assert.match(css, /min-width:\s*641px\) and \(max-width:\s*900px/);
  assert.match(css, /min-width:\s*641px\) and \(max-height:\s*700px/);
  assert.match(css, /\.app-shell \.sidebar-nav[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.app-shell \.panel:has\(table\)[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.app-shell input,[\s\S]*?font-size:\s*1rem/);
  assert.match(css, /\.app-shell td \{[\s\S]*?font-size:\s*0\.92rem/);
});

test("1440x900 desktops use a denser signed-in workspace without changing report print layout", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../frontend/styles/app.css"), "utf8");
  assert.match(css, /Medium-density desktop layout/);
  assert.match(css, /min-width:\s*901px\) and \(max-width:\s*1600px\) and \(max-height:\s*900px\)/);
  assert.match(css, /grid-template-columns:\s*228px minmax\(0, 1fr\)/);
  assert.match(css, /\.app-shell \.sidebar-nav a \{[\s\S]*?min-height:\s*35px/);
  assert.match(css, /\.app-shell textarea \{[\s\S]*?min-height:\s*84px/);
  assert.match(css, /public pages, generated reports, or A4 printing/);
});

test("only the server prevents automatic sleep and still allows its display to turn off", () => {
  const calls = [];
  const active = new Set();
  const blocker = {
    start(type) {
      calls.push(["start", type]);
      active.add(17);
      return 17;
    },
    isStarted: id => active.has(id),
    stop(id) {
      calls.push(["stop", id]);
      return active.delete(id);
    },
  };

  const server = createServerAvailabilityGuard({ appMode: "server", powerSaveBlocker: blocker });
  assert.equal(server.start(), 17);
  assert.equal(server.start(), 17, "repeat starts must not create duplicate blockers");
  assert.equal(server.isActive(), true);
  assert.deepEqual(calls, [["start", "prevent-app-suspension"]]);
  assert.equal(server.stop(), true);
  assert.equal(server.isActive(), false);
  assert.deepEqual(calls, [["start", "prevent-app-suspension"], ["stop", 17]]);

  const client = createServerAvailabilityGuard({ appMode: "client", powerSaveBlocker: blocker });
  assert.equal(client.start(), null);
  assert.equal(calls.length, 2, "client PCs retain their normal Windows sleep policy");
});
