const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Keeps a downloaded desktop update from being postponed indefinitely. The
 * controller is intentionally independent of Electron so its timing and
 * prompt behaviour can be verified without starting the desktop application.
 */
function createMandatoryUpdateController({
  autoUpdater,
  dialog,
  getWindow = () => null,
  appMode = "client",
  productName = "LabShield",
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  log = console,
  forceAfterMs = SIX_HOURS_MS,
} = {}) {
  if (!autoUpdater) throw new Error("An autoUpdater is required.");
  if (!dialog?.showMessageBox) throw new Error("Electron dialog support is required.");

  let deadlineAt = null;
  let deadlineTimer = null;
  let downloadedUpdate = null;
  let downloadedVersion = null;
  let promptVersion = null;
  let installing = false;

  function clearDeadlineTimer() {
    if (deadlineTimer) clearTimer(deadlineTimer);
    deadlineTimer = null;
  }

  function startInstall(reason) {
    if (installing || !downloadedUpdate) return false;
    installing = true;
    clearDeadlineTimer();
    log.info?.(`${productName} ${downloadedVersion || "update"} is installing (${reason}).`);

    // The client installer is per-user and can be installed silently. The
    // central server is per-machine and Windows may show its required UAC
    // elevation prompt; code cannot safely bypass that operating-system check.
    autoUpdater.quitAndInstall(appMode !== "server", true);
    return true;
  }

  function enforceDeadline() {
    if (!downloadedUpdate || installing || deadlineAt === null) return false;
    if (now() < deadlineAt) return false;
    return startInstall("six-hour mandatory update deadline");
  }

  function scheduleDeadline() {
    clearDeadlineTimer();
    if (!downloadedUpdate || installing || deadlineAt === null) return;
    const remaining = Math.max(0, deadlineAt - now());
    deadlineTimer = setTimer(() => {
      deadlineTimer = null;
      enforceDeadline();
    }, remaining);
  }

  async function showReadyPrompt(update) {
    const version = String(update?.version || "latest");
    if (promptVersion === version || installing) return;
    promptVersion = version;

    try {
      const promptOptions = {
        type: "info",
        title: `${productName} update ready`,
        message: `Version ${version} has been downloaded.`,
        detail: `Restart now to install it. If you choose Later or close this message, ${productName} will restart and install the update automatically within 6 hours.`,
        buttons: ["Restart and update now", "Later"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      };
      const parentWindow = getWindow();
      const response = parentWindow
        ? await dialog.showMessageBox(parentWindow, promptOptions)
        : await dialog.showMessageBox(promptOptions);
      if (response?.response === 0) startInstall("user selected restart and update");
    } catch (error) {
      // A dismissed or unavailable dialog must never cancel the deadline.
      log.warn?.("Unable to show the desktop update prompt:", error?.message || error);
    }
  }

  function onDownloaded(update) {
    const version = String(update?.version || "latest");
    if (downloadedVersion !== version) {
      downloadedUpdate = update;
      downloadedVersion = version;
      promptVersion = null;
      installing = false;
      deadlineAt = now() + forceAfterMs;
      log.info?.(`${productName} ${version} is ready. Mandatory installation deadline: ${new Date(deadlineAt).toISOString()}.`);
    }
    scheduleDeadline();
    void showReadyPrompt(update);
  }

  function start() {
    autoUpdater.autoDownload = true;
    // Install promptly if the user exits, while the explicit deadline below
    // guarantees installation for apps that remain open.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.on("update-available", (update) => {
      log.info?.(`Downloading ${productName} ${update.version} in the background.`);
    });
    autoUpdater.on("update-downloaded", onDownloaded);
    autoUpdater.on("error", (error) => {
      log.warn?.("Automatic updater error:", error?.message || error);
    });
  }

  function stop() {
    clearDeadlineTimer();
  }

  return {
    start,
    stop,
    enforceDeadline,
    onDownloaded,
    getState: () => ({
      deadlineAt,
      downloadedVersion,
      installing,
      remainingMs: deadlineAt === null ? null : Math.max(0, deadlineAt - now()),
    }),
  };
}

module.exports = { SIX_HOURS_MS, createMandatoryUpdateController };
