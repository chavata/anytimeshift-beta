const { createSessionCookie, timingSafeEqualStrings } = require("./_lib/auth");
const { checkAndRecord, getClientIp } = require("./_lib/rateLimit");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ message: "Admin auth not configured" }) };
  }

  const ip = getClientIp(event);
  const rl = await checkAndRecord("admin_login", ip);
  if (!rl.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        message: `Too many login attempts. Please try again in ${rl.config.windowMinutes} minutes.`,
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON" }) };
  }

  const { password } = body;
  if (!password || !timingSafeEqualStrings(password, process.env.ADMIN_PASSWORD)) {
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid credentials" }) };
  }

  const { cookie } = createSessionCookie(process.env.ADMIN_SECRET);

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: "Logged in" }),
  };
};
