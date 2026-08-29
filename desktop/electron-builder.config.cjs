const mode = process.env.LAB_LMS_BUILD_MODE === "server" ? "server" : "client";
const isServer = mode === "server";
const packageVersion = require("../package.json").version;

module.exports = {
  appId: isServer ? "xyz.nexorawebstudios.labshield.server" : "xyz.nexorawebstudios.labshield.client",
  productName: isServer ? "LabShield Server" : "LabShield",
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
  extraResources: isServer ? [
    {
      from: "labshield-catalogue.db",
      to: "labshield-catalogue.db",
    },
  ] : [],
  win: {
    icon: "desktop/assets/labshield-icon.ico",
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: isServer
      ? "LabShield-Server-Setup-${version}-win10-x64.${ext}"
      : "LabShield-Client-Setup-${version}-win10-x64.${ext}",
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
