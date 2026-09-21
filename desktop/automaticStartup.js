function ensureAutomaticStartup({
  app,
  platform = process.platform,
  executablePath = process.execPath,
  logger = console,
} = {}) {
  if (!app || platform !== "win32" || !app.isPackaged) {
    return { configured: false, reason: "not-packaged-windows" };
  }

  const settings = {
    openAtLogin: true,
    openAsHidden: false,
    path: executablePath,
  };

  try {
    app.setLoginItemSettings(settings);
    const current = typeof app.getLoginItemSettings === "function"
      ? app.getLoginItemSettings({ path: executablePath })
      : { openAtLogin: true };

    const willLaunch = typeof current?.executableWillLaunchAtLogin === "boolean"
      ? current.executableWillLaunchAtLogin
      : current?.openAtLogin;
    if (!willLaunch) {
      logger.warn("LabShield could not confirm its Windows automatic-startup registration.");
      return { configured: false, reason: "registration-not-confirmed", settings };
    }

    return { configured: true, settings };
  } catch (error) {
    logger.warn("LabShield could not register automatic Windows startup:", error?.message || error);
    return { configured: false, reason: "registration-failed", settings };
  }
}

module.exports = { ensureAutomaticStartup };
