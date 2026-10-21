const { createSupabaseClient } = require("../_lib/supabase");
const { readJsonBody, requireMethod, sendJson } = require("../_lib/http");
const { normalizePhone, phoneToEmail } = require("../_lib/phone");

module.exports = async function signup(req, res) {
  if (requireMethod(req, res, "POST")) return;

  const body = readJsonBody(req);
  const phone = normalizePhone(body?.phone);
  const password = typeof body?.password === "string" ? body.password : "";
  const displayName = typeof body?.display_name === "string" ? body.display_name.trim() : "";

  if (!phone) {
    return sendJson(res, 400, { error: "Enter a valid 10 digit mobile number." });
  }

  if (password.length < 8 || password.length > 128) {
    return sendJson(res, 400, { error: "Password must be between 8 and 128 characters." });
  }

  if (displayName.length > 60) {
    return sendJson(res, 400, { error: "Display name must be 60 characters or fewer." });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return sendJson(res, 503, { error: "Authentication is not configured." });

  const { data, error } = await supabase.auth.signUp({
    email: phoneToEmail(phone),
    password,
    options: { data: { phone, display_name: displayName || null } }
  });

  if (error) {
    console.error("Supabase signup failed", error.status || error.code || "unknown");
    if (error.code === "user_already_exists") {
      return sendJson(res, 409, { error: "This mobile number is already registered. Please log in." });
    }
    const status = error.status >= 500 ? 502 : 400;
    return sendJson(res, status, { error: "Unable to create an account with these details." });
  }

  if (!data.user) {
    console.error("Supabase signup returned no user");
    return sendJson(res, 502, { error: "Unable to create an account right now." });
  }

  return sendJson(res, 201, {
    user: {
      id: data.user.id,
      phone,
      created_at: data.user.created_at
    },
    session: data.session ? {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type
    } : null,
    email_confirmation_required: data.session === null
  });
};
