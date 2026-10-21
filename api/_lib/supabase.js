const { createClient } = require("@supabase/supabase-js");

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return { url, anonKey };
}

function createSupabaseClient(accessToken) {
  const config = getSupabaseConfig();
  if (!config) return null;

  const options = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  };

  if (accessToken) {
    options.global = { headers: { Authorization: `Bearer ${accessToken}` } };
  }

  return createClient(config.url, config.anonKey, options);
}

module.exports = { createSupabaseClient, getSupabaseConfig };
