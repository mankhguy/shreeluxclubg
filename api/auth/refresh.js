const { createSupabaseClient } = require("../_lib/supabase");
const { readJsonBody, requireMethod, sendJson } = require("../_lib/http");

module.exports = async function refresh(req, res) {
  if (requireMethod(req, res, "POST")) return;

  const body = readJsonBody(req);
  const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";
  if (!refreshToken || refreshToken.length > 2048) {
    return sendJson(res, 400, { error: "A valid refresh token is required." });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return sendJson(res, 503, { error: "Authentication is not configured." });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    if (error) console.error("Supabase session refresh failed", error.status || error.code || "unknown");
    return sendJson(res, 401, { error: "The session could not be refreshed. Please sign in again." });
  }

  return sendJson(res, 200, {
    user: {
      id: data.user.id,
      phone: (data.user.user_metadata && data.user.user_metadata.phone) || null,
      created_at: data.user.created_at
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type
    }
  });
};
