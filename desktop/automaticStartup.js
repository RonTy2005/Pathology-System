const fs = require("node:fs");
const path = require("node:path");

function ensureAutomaticStartup({
  app,
  shell,
  appMode = "client",
  platform = process.platform,
  executablePath = process.execPath,
  fileSystem = fs,
  pathModule = path,
  logger = console,
} = {}) {
  if (!app || platform !== "win32" || !app.isPackaged) {
    return { configured: false, reason: "not-packaged-windows" };
  }

  const settings = {
    openAtLogin: true,
    enabled: true,
    name: appMode === "server" ? "LabShield Server" : "LabShield",
    path: executablePath,
  };

  let loginItemConfigured = false;
  try {
    app.setLoginItemSettings(settings);
    const current = typeof app.getLoginItemSettings === "function"
      ? app.getLoginItemSettings({ path: executablePath })
      : { openAtLogin: true };

    const willLaunch = typeof current?.executableWillLaunchAtLogin === "boolean"
      ? current.executableWillLaunchAtLogin
      : current?.openAtLogin;
    loginItemConfigured = !!willLaunch;
    if (!loginItemConfigured) logger.warn("LabShield could not confirm its Windows login-item registration.");
  } catch (error) {
    logger.warn("LabShield could not register automatic Windows startup:", error?.message || error);
  }

  // The installer may run elevated under a different account. Register a
  // shortcut for the account actually running the app, so its own data profile
  // is used at the next sign-in. This also repairs a disabled/stale Run entry.
  let shortcutConfigured = false;
  let shortcutPath = null;
  try {
    const startupDirectory = pathModule.join(
      app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
    );
    shortcutPath = pathModule.join(startupDirectory, `${settings.name}.lnk`);
    let existing = null;
    try { existing = shell?.readShortcutLink?.(shortcutPath); } catch (_error) { /* No existing shortcut. */ }
    const sameTarget = existing?.target
      && pathModule.normalize(existing.target).toLowerCase() === pathModule.normalize(executablePath).toLowerCase();
    if (sameTarget && existing.args === "--autostart") {
      shortcutConfigured = true;
    } else if (shell?.writeShortcutLink) {
      fileSystem.mkdirSync(startupDirectory, { recursive: true });
      shortcutConfigured = shell.writeShortcutLink(shortcutPath, "create", {
        target: executablePath,
        cwd: pathModule.dirname(executablePath),
        args: "--autostart",
        description: `${settings.name} starts when this Windows user signs in`,
      });
    }
  } catch (error) {
    logger.warn("LabShield could not create its Windows Startup shortcut:", error?.message || error);
  }

  if (!loginItemConfigured && !shortcutConfigured) {
    logger.warn("LabShield automatic startup is not configured for this Windows account.");
  }
  return {
    configured: loginItemConfigured || shortcutConfigured,
    loginItemConfigured,
    shortcutConfigured,
    shortcutPath,
    settings,
  };
}

module.exports = { ensureAutomaticStartup };
