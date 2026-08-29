const { createApp } = require("./src/app");
const { initializeDatabase } = require("./src/db/init");
const { startLanDiscoveryService } = require("./src/services/lanDiscoveryService");
const os = require("os");

const PORT = process.env.PORT || 3000;
// 0.0.0.0 makes the one server instance available to devices on the private LAN.
const HOST = process.env.HOST || "0.0.0.0";

function getLanUrls(port) {
  const addresses = Object.values(os.networkInterfaces()).flat();
  return Array.from(new Set(
    addresses
      .filter((address) => address && !address.internal && (address.family === "IPv4" || address.family === 4))
      .map((address) => `http://${address.address}:${port}`)
  ));
}

async function bootstrap() {
  await initializeDatabase();
  const app = createApp();

  const httpServer = app.listen(PORT, HOST, () => {
    const discovery = startLanDiscoveryService({
      httpPort: PORT,
      onError: (message) => console.warn(message),
    });
    console.log(`LabShield server running on http://localhost:${PORT}`);
    if (HOST === "0.0.0.0" || HOST === "::") {
      for (const url of getLanUrls(PORT)) {
        console.log(`LAN access: ${url}`);
      }
    }
    console.log("LAN auto-discovery is ready on UDP port " + discovery.port + ".");

    httpServer.labLmsDiscovery = discovery;
  });

  const shutdown = () => {
    httpServer.labLmsDiscovery?.stop?.().finally(() => {
      httpServer.close(() => process.exit(0));
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return httpServer;
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error("Failed to start LabShield:", error);
    process.exit(1);
  });
}

module.exports = { bootstrap, getLanUrls };
