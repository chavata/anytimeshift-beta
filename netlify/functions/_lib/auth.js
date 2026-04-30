const crypto = require("crypto");

const COOKIE_NAME = "ats_admin";
const TTL_SECONDS = 8 * 60 * 60;

function sign(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function createSessionCookie(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = String(expiresAt);
  const sig = sign(secret, payload);
  const value = `${payload}.${sig}`;
  return {
    cookie: `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL_SECONDS}`,
    value,
  };
}

function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function parseCookies(header) {
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

function verifySessionCookie(cookieHeader, secret) {
  const cookies = parseCookies(cookieHeader);
  const value = cookies[COOKIE_NAME];
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot === -1) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(secret, payload);
  if (sig.length !== expected.length) return false;
  let sigBuf, expBuf;
  try {
    sigBuf = Buffer.from(sig, "hex");
    expBuf = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  const expiresAt = parseInt(payload, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  return true;
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  COOKIE_NAME,
  createSessionCookie,
  clearCookie,
  verifySessionCookie,
  timingSafeEqualStrings,
};
