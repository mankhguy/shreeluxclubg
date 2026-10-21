const { createSupabaseClient } = require("./supabase");
const { getBearerToken, sendJson } = require("./http");

// Validates the bearer token and returns a Supabase client that acts as the
// signed-in user (so row level security applies to every query). Sends the
// error response itself and returns null when the caller must stop.
async function getAuthenticatedClient(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "A valid bearer token is required." });
    return null;
  }

  const supabase = createSupabaseClient(token);
  if (!supabase) {
    sendJson(res, 503, { error: "Authentication is not configured." });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    if (error) console.error("Supabase token validation failed", error.status || error.code || "unknown");
    sendJson(res, 401, { error: "The session is invalid or expired." });
    return null;
  }

  return { supabase, user: data.user, token };
}

module.exports = { getAuthenticatedClient };
