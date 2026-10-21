function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

function requireMethod(req, res, method) {
  if (req.method === method) return false;
  res.setHeader("Allow", method);
  sendJson(res, 405, { error: "Method not allowed" });
  return true;
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }

  if (typeof req.body !== "string") {
    return null;
  }

  try {
    const body = JSON.parse(req.body);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function getBearerToken(req) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer\s+(\S+)$/i)
    : null;
  return match ? match[1] : null;
}

module.exports = { getBearerToken, readJsonBody, requireMethod, sendJson };
