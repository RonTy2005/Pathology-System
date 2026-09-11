const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { SIX_HOURS_MS, createMandatoryUpdateController } = require("../desktop/mandatoryUpdateController");

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

test("downloaded updates prompt once, set a six-hour deadline and install when deferred", async () => {
  const f = fixture();
  f.controller.start();
  assert.equal(f.updater.autoDownload, true);
  assert.equal(f.updater.autoInstallOnAppQuit, true);
  assert.equal(f.updater.autoRunAppAfterInstall, true);
  f.updater.emit("update-downloaded", { version: "1.2.0" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dialog.calls.length, 1);
  assert.match(f.dialog.calls[0].detail, /within 6 hours/);
  assert.deepEqual(f.dialog.calls[0].buttons, ["Restart and update now", "Later"]);
  assert.equal(f.controller.getState().remainingMs, SIX_HOURS_MS);
  assert.equal([...f.timers.values()][0].delay, SIX_HOURS_MS);

  f.updater.emit("update-downloaded", { version: "1.2.0" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dialog.calls.length, 1, "repeat download events do not repeatedly prompt");
  f.advance(SIX_HOURS_MS);
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
  f.advance(SIX_HOURS_MS + 1);
  assert.equal(f.controller.enforceDeadline(), true);
  assert.deepEqual(f.updater.quitAndInstallCalls, [[true, true]]);
});
