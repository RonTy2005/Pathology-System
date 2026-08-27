const dgram = require("dgram");

const LAN_DISCOVERY_PORT = 32480;
const DISCOVERY_REQUEST = "lab-lms-discover";
const DISCOVERY_RESPONSE = "lab-lms-server";

function startLanDiscoveryService({ httpPort, onError = console.error } = {}) {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  socket.on("error", (error) => {
    onError("LAN discovery is unavailable: " + error.message);
  });

  socket.on("message", (message, remote) => {
    let request;
    try {
      request = JSON.parse(message.toString("utf8"));
    } catch (_error) {
      return;
    }

    if (request?.type !== DISCOVERY_REQUEST) return;

    const response = Buffer.from(JSON.stringify({
      type: DISCOVERY_RESPONSE,
      service: "lab-lms",
      httpPort,
    }));

    socket.send(response, remote.port, remote.address, (error) => {
      if (error) onError("LAN discovery reply failed: " + error.message);
    });
  });

  socket.bind(LAN_DISCOVERY_PORT, "0.0.0.0", () => {
    socket.setBroadcast(true);
  });

  return {
    port: LAN_DISCOVERY_PORT,
    stop: () => new Promise((resolve) => socket.close(resolve)),
  };
}

module.exports = {
  LAN_DISCOVERY_PORT,
  DISCOVERY_REQUEST,
  DISCOVERY_RESPONSE,
  startLanDiscoveryService,
};
