const { createSupabaseClient } = require("../_lib/supabase");
const { getBearerToken, readJsonBody, requireMethod, sendJson } = require("../_lib/http");

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

  return { supabase, user: data.user };
}

module.exports = async function profile(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const auth = await getAuthenticatedClient(req, res);
  if (!auth) return;

  if (req.method === "GET") {
    const { data, error } = await auth.supabase
      .from("profiles")
      .select("id, display_name, created_at, updated_at")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("Supabase profile lookup failed", error.code || "unknown");
      return sendJson(res, 502, { error: "Unable to load profile." });
    }

    if (!data) return sendJson(res, 404, { error: "Profile not found." });
    return sendJson(res, 200, { profile: data });
  }

  const body = readJsonBody(req);
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : null;
  if (displayName === null || displayName.length > 60) {
    return sendJson(res, 400, { error: "Display name must be a string of 60 characters or fewer." });
  }

  const { data, error } = await auth.supabase
    .from("profiles")
    .update({ display_name: displayName || null })
    .eq("id", auth.user.id)
    .select("id, display_name, created_at, updated_at")
    .single();

  if (error) {
    console.error("Supabase profile update failed", error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to update profile." });
  }

  return sendJson(res, 200, { profile: data });
};
