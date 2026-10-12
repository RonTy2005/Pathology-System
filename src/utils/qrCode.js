const bwipjs = require("bwip-js");

function buildQrCodeDataUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const svg = bwipjs.toSVG({
    bcid: "qrcode",
    text,
    eclevel: "M",
    scale: 2,
    // Leave a white quiet zone around the symbol so it remains scannable
    // when embedded in a report or printed over a letterhead.
    paddingwidth: 8,
    paddingheight: 8,
    backgroundcolor: "FFFFFF",
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

module.exports = { buildQrCodeDataUrl };
