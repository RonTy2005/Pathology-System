const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { ONE_HOUR_MS, createMandatoryUpdateController } = require("../desktop/mandatoryUpdateController");
const { ensureAutomaticStartup } = require("../desktop/automaticStartup");
const { createServerAvailabilityGuard } = require("../desktop/serverAvailability");
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
  const app = {
    isPackaged: true,
    setLoginItemSettings: settings => calls.push(settings),
    getLoginItemSettings: () => ({ openAtLogin: true }),
  };
  const result = ensureAutomaticStartup({
    app,
    platform: "win32",
    executablePath: "C:\\Program Files\\LabShield\\LabShield.exe",
  });
  assert.equal(result.configured, true);
  assert.deepEqual(calls, [{
    openAtLogin: true,
    openAsHidden: false,
    path: "C:\\Program Files\\LabShield\\LabShield.exe",
  }]);

  const development = ensureAutomaticStartup({ app: { ...app, isPackaged: false }, platform: "win32" });
  assert.equal(development.configured, false);
  assert.equal(calls.length, 1, "development launches must not change Windows startup settings");

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
