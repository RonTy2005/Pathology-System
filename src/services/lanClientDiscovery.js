const dgram = require("dgram");
const http = require("http");
const https = require("https");

const {
  LAN_DISCOVERY_PORT,
  DISCOVERY_REQUEST,
  DISCOVERY_RESPONSE,
} = require("./lanDiscoveryService");

function normalizeServerUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+(?::\d+)?$/i.test(candidate)) {
    return null;
  }

  return candidate;
}

function requestJson(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith("https:") ? https : http;
    const request = transport.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
  });
}

async function isLabServer(serverUrl, timeoutMs = 2500) {
  const normalizedUrl = normalizeServerUrl(serverUrl);
  if (!normalizedUrl) return false;

  try {
    const health = await requestJson(`${normalizedUrl}/health`, timeoutMs);
    return health?.ok === true && health?.service === "lab-lms";
  } catch (_error) {
    return false;
  }
}

function collectDiscoveryReplies(timeoutMs) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const candidates = new Set();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch (_error) {
        // The socket may already have closed after a network error.
      }
      resolve([...candidates]);
    };

    socket.on("error", finish);
    socket.on("message", (message, remote) => {
      try {
        const payload = JSON.parse(message.toString("utf8"));
        if (
          payload?.type === DISCOVERY_RESPONSE
          && payload?.service === "lab-lms"
          && Number.isInteger(Number(payload.httpPort))
        ) {
          candidates.add(`http://${remote.address}:${Number(payload.httpPort)}`);
        }
      } catch (_error) {
        // Ignore unrelated traffic on the UDP discovery port.
      }
    });

    socket.bind(0, "0.0.0.0", () => {
      try {
        socket.setBroadcast(true);
        const request = Buffer.from(JSON.stringify({ type: DISCOVERY_REQUEST }));
        socket.send(request, LAN_DISCOVERY_PORT, "255.255.255.255", () => undefined);
      } catch (_error) {
        finish();
      }
    });

    setTimeout(finish, Math.max(500, timeoutMs));
  });
}

async function discoverLabServers({ timeoutMs = 3500, healthTimeoutMs = 2200 } = {}) {
  const candidates = await collectDiscoveryReplies(timeoutMs);
  const checks = await Promise.all(candidates.map(async (serverUrl) => (
    (await isLabServer(serverUrl, healthTimeoutMs)) ? serverUrl : null
  )));

  return checks.filter(Boolean).sort();
}

module.exports = {
  normalizeServerUrl,
  isLabServer,
  discoverLabServers,
};
