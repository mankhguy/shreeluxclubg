const { createSupabaseClient } = require("../_lib/supabase");
const { getBearerToken, readJsonBody, requireMethod, sendJson } = require("../_lib/http");
const { normalizePhone, phoneToEmail } = require("../_lib/phone");

module.exports = async function changePassword(req, res) {
  if (requireMethod(req, res, "POST")) return;

  const token = getBearerToken(req);
  if (!token) return sendJson(res, 401, { error: "A valid bearer token is required." });

  const body = readJsonBody(req);
  const currentPassword = typeof body?.current_password === "string" ? body.current_password : "";
  const newPassword = typeof body?.new_password === "string" ? body.new_password : "";

  if (!currentPassword) {
    return sendJson(res, 400, { error: "Enter your current password." });
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return sendJson(res, 400, { error: "The new password must be between 8 and 128 characters." });
  }

  if (currentPassword === newPassword) {
    return sendJson(res, 400, { error: "Choose a new password different from the current one." });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return sendJson(res, 503, { error: "Authentication is not configured." });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    if (error) console.error("Supabase token validation failed", error.status || error.code || "unknown");
    return sendJson(res, 401, { error: "The session is invalid or expired." });
  }

  const metadata = data.user.user_metadata || {};
  const phone = normalizePhone(metadata.phone);
  const email = phone ? phoneToEmail(phone) : data.user.email;

  if (!email) {
    console.error("Supabase account has no usable identifier for a password change");
    return sendJson(res, 400, { error: "This account cannot change its password." });
  }

  const verify = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verify.error) {
    return sendJson(res, 401, { error: "Your current password is incorrect." });
  }

  const authedSupabase = createSupabaseClient(token);
  const update = await authedSupabase.auth.updateUser({ password: newPassword });
  if (update.error) {
    console.error("Supabase password update failed", update.error.status || update.error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to update the password right now." });
  }

  return sendJson(res, 200, { message: "Password updated." });
};
