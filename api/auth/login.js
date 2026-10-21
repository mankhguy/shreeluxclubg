const { createSupabaseClient } = require("../_lib/supabase");
const { readJsonBody, requireMethod, sendJson } = require("../_lib/http");
const { normalizePhone, phoneToEmail } = require("../_lib/phone");

module.exports = async function login(req, res) {
  if (requireMethod(req, res, "POST")) return;

  const body = readJsonBody(req);
  const phone = normalizePhone(body?.phone);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!phone || !password || password.length > 128) {
    return sendJson(res, 400, { error: "Mobile number and password are required." });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return sendJson(res, 503, { error: "Authentication is not configured." });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: phoneToEmail(phone),
    password
  });
  if (error) {
    console.error("Supabase login failed", error.status || error.code || "unknown");
    const status = error.status >= 500 ? 502 : 401;
    return sendJson(res, status, { error: "Mobile number or password is incorrect." });
  }

  if (!data.user || !data.session) {
    console.error("Supabase login returned no active session");
    return sendJson(res, 502, { error: "Unable to start a session right now." });
  }

  return sendJson(res, 200, {
    user: {
      id: data.user.id,
      phone,
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
