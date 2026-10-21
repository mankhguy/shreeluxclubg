const { getAuthenticatedClient } = require("../_lib/auth");
const { readJsonBody, requireMethod, sendJson } = require("../_lib/http");

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;

function parseAmount(value) {
  const amount = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(amount)) return null;

  const rounded = Math.round(amount * 100) / 100;
  if (rounded < MIN_AMOUNT || rounded > MAX_AMOUNT) return null;
  return rounded;
}

module.exports = async function deposit(req, res) {
  if (requireMethod(req, res, "POST")) return;

  const auth = await getAuthenticatedClient(req, res);
  if (!auth) return;

  const body = readJsonBody(req);
  const amount = parseAmount(body && body.amount);
  if (amount === null) {
    return sendJson(res, 400, {
      error: `Enter a deposit amount between ${MIN_AMOUNT} and ${MAX_AMOUNT}.`
    });
  }

  const { data, error } = await auth.supabase
    .from("wallet_transactions")
    .insert({ user_id: auth.user.id, kind: "deposit", amount, status: "pending" })
    .select("id, kind, amount, status, created_at")
    .single();

  if (error) {
    console.error("Supabase deposit request failed", error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to create the deposit request right now." });
  }

  return sendJson(res, 201, {
    transaction: {
      id: data.id,
      kind: data.kind,
      amount: Number(data.amount),
      status: data.status,
      created_at: data.created_at
    },
    message: "Deposit request created. It will be confirmed after review."
  });
};
