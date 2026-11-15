const { execFile } = require('node:child_process');
const path = require('node:path');

function ensureScheduledStartup({ app, appMode = 'client', executablePath = process.execPath, platform = process.platform, runCommand = execFile, logger = console } = {}) {
  if (!app?.isPackaged || platform !== 'win32') return Promise.resolve({ configured: false, reason: 'not-packaged-windows' });
  const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise(resolve => {
    // No command-string interpolation: paths with spaces, quotes or Unicode
    // remain separate arguments. ExecutionPolicy is process-scoped only.
    runCommand(powershell, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'startupTask.ps1'), '-Mode', 'Register', '-ExecutablePath', executablePath, '-AppMode', appMode],
      { windowsHide: true, timeout: 15000, maxBuffer: 128 * 1024 }, (error, stdout) => {
        let result;
        try { result = JSON.parse(String(stdout || '').trim()); } catch (_) { result = null; }
        if (error || !result?.configured) {
          const message = result?.error || error?.message || 'Windows did not confirm the startup task.';
          logger.warn('LabShield could not configure its Windows sign-in task:', message);
          resolve({ configured: false, error: message });
        } else resolve(result);
      });
  });
}

module.exports = { ensureScheduledStartup };
