const mode = process.env.LAB_LMS_BUILD_MODE === "server" ? "server" : "client";
const isServer = mode === "server";
const windowsFamily = process.env.LAB_LMS_WINDOWS_FAMILY === "win7" ? "win7" : "win10";
const isWindows7Build = windowsFamily === "win7";
const buildArch = process.env.LAB_LMS_BUILD_ARCH === "ia32" ? "ia32" : "x64";
const architectureLabel = buildArch === "ia32" ? "x86" : "x64";
const updaterChannel = isWindows7Build
  ? `${mode}-win7-${architectureLabel}`
  : (isServer ? "server" : "client");
const packageVersion = require("../package.json").version;

module.exports = {
  appId: isServer ? "xyz.nexorawebstudios.labshield.server" : "xyz.nexorawebstudios.labshield.client",
  productName: isServer ? "LabShield Server" : "LabShield",
  asar: false,
  ...(isWindows7Build ? { electronVersion: "22.3.27" } : {}),
  directories: {
    output: isWindows7Build
      ? `release-${mode}-${packageVersion}-win7-${architectureLabel}`
      : `release-${mode}-${packageVersion}`,
  },
  files: [
    "desktop/**/*",
    "frontend/**/*",
    "src/**/*",
    "server.js",
    "package.json",
  ],
  extraMetadata: {
    // The updater cache lives under the packaged app name. Keep client and
    // server downloads separate even though they are built from one source tree.
    name: isServer ? "labshield-server" : "labshield-client",
    main: "desktop/main.js",
    labLmsMode: mode,
  },
  publish: [{
    provider: "github",
    owner: "RonTy2005",
    repo: "Pathology-System",
    // Both desktop products share one GitHub Release. Separate channels prevent
    // a client install from ever downloading the server installer, and vice versa.
    channel: updaterChannel,
    releaseType: "release",
  }],
  extraResources: isServer ? [
    {
      from: "labshield-catalogue.db",
      to: "labshield-catalogue.db",
    },
  ] : [],
  win: {
    icon: "desktop/assets/labshield-icon.ico",
    target: [{ target: "nsis", arch: [buildArch] }],
    artifactName: isServer
      ? `LabShield-Server-Setup-\${version}-${windowsFamily}-${architectureLabel}.\${ext}`
      : `LabShield-Client-Setup-\${version}-${windowsFamily}-${architectureLabel}.\${ext}`,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    perMachine: isServer,
    createDesktopShortcut: true,
    shortcutName: isServer ? "LabShield Server" : "LabShield",
    include: isServer ? "desktop/installer/server-firewall.nsh" : undefined,
  },
};
