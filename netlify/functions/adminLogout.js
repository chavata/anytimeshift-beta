const { clearCookie } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }
  return {
    statusCode: 200,
    headers: { "Set-Cookie": clearCookie(), "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Logged out" }),
  };
};
