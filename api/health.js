const { getSupabaseConfig } = require("./_lib/supabase");
const { requireMethod, sendJson } = require("./_lib/http");

module.exports = function health(req, res) {
  if (requireMethod(req, res, "GET")) return;

  const configured = Boolean(getSupabaseConfig());
  return sendJson(res, configured ? 200 : 503, {
    status: configured ? "ok" : "configuration_required",
    service: "shreeluxclubg-api"
  });
};
