const mode = process.env.LAB_LMS_BUILD_MODE === "server" ? "server" : "client";
const isServer = mode === "server";
const packageVersion = require("../package.json").version;

module.exports = {
  appId: isServer ? "xyz.nexorawebstudios.lablms.server" : "xyz.nexorawebstudios.lablms.client",
  productName: isServer ? "Lab LMS Server" : "Lab LMS",
  asar: false,
  directories: {
    output: `release-${mode}-${packageVersion}`,
  },
  files: [
    "desktop/**/*",
    "frontend/**/*",
    "src/**/*",
    "server.js",
    "package.json",
  ],
  extraMetadata: {
    main: "desktop/main.js",
    labLmsMode: mode,
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: isServer
      ? "Lab-LMS-Server-Setup-${version}.${ext}"
      : "Lab-LMS-Client-Setup-${version}.${ext}",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    perMachine: isServer,
    createDesktopShortcut: true,
    shortcutName: isServer ? "Lab LMS Server" : "Lab LMS",
    include: isServer ? "desktop/installer/server-firewall.nsh" : undefined,
  },
};
