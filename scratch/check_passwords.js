
const crypto = require('crypto');

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return password === storedHash;
  }
  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

const adminHash = "f26ae0369af8afce5e59c3142dd0f366:5d30f02f3497fbc29a36bd742b31c6818d732df08a161548126e364007eb0062094cbd5c42aa5dd728512c2648834c08405af9a46e85f9dc5ea3cb4a52f01bbb";
console.log("admin123 matches:", verifyPassword("admin123", adminHash));

const technicianHash = "d1ac030e0e9f3f7d5b7c57cf8a9fb4aa:e7e52b0ec15992e734f7d61600e08fd59e58259f80305a1776408a69a365efa017132b18c6b1a9efbe91961a79798025bb19136b336606ccaddae7176b68fbbe";
console.log("technician123 matches:", verifyPassword("technician123", technicianHash));
