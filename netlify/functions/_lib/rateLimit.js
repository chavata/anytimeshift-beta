const { getSupabase } = require("./supabase");

const DEFAULTS = {
  signup:      { windowMinutes: 5,  maxAttempts: 5  },
  admin_login: { windowMinutes: 15, maxAttempts: 10 },
};

async function checkAndRecord(kind, ip, overrides = {}) {
  const cfg = { ...(DEFAULTS[kind] || { windowMinutes: 5, maxAttempts: 5 }), ...overrides };
  if (!ip || ip === "unknown") return { allowed: true, remaining: cfg.maxAttempts, config: cfg };

  const supabase = getSupabase();
  const since = new Date(Date.now() - cfg.windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("rate_limit_attempts")
    .select("*", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("ip", ip)
    .gte("attempted_at", since);

  if (error) {
    console.error(`Rate limit count error (${kind}):`, error);
    return { allowed: true, remaining: cfg.maxAttempts, config: cfg };
  }

  if (count >= cfg.maxAttempts) {
    return { allowed: false, remaining: 0, config: cfg };
  }

  await supabase.from("rate_limit_attempts").insert({ kind, ip });
  return { allowed: true, remaining: cfg.maxAttempts - count - 1, config: cfg };
}

function getClientIp(event) {
  const xff = event.headers["x-forwarded-for"] || event.headers["X-Forwarded-For"];
  if (xff) return xff.split(",")[0].trim();
  return event.headers["client-ip"] || event.headers["x-nf-client-connection-ip"] || "unknown";
}

module.exports = { checkAndRecord, getClientIp };
