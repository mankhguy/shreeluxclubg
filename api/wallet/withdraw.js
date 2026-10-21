const { getAuthenticatedClient } = require("../_lib/auth");
const { readJsonBody, requireMethod, sendJson } = require("../_lib/http");

const MIN_AMOUNT = 100;

function parseAmount(value) {
  const amount = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

module.exports = async function withdraw(req, res) {
  if (requireMethod(req, res, "POST")) return;

  const auth = await getAuthenticatedClient(req, res);
  if (!auth) return;

  const body = readJsonBody(req);
  const amount = parseAmount(body && body.amount);
  if (amount === null || amount < MIN_AMOUNT) {
    return sendJson(res, 400, { error: `The minimum withdrawal amount is ${MIN_AMOUNT}.` });
  }

  const walletResult = await auth.supabase
    .from("wallets")
    .select("balance")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (walletResult.error) {
    console.error("Supabase wallet lookup failed", walletResult.error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to check your balance right now." });
  }

  const pendingResult = await auth.supabase
    .from("wallet_transactions")
    .select("amount")
    .eq("user_id", auth.user.id)
    .eq("kind", "withdraw")
    .eq("status", "pending");

  if (pendingResult.error) {
    console.error("Supabase pending withdrawal lookup failed", pendingResult.error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to check your balance right now." });
  }

  const balance = walletResult.data ? toAmount(walletResult.data.balance) : 0;
  const pendingTotal = (pendingResult.data || []).reduce(function (total, row) {
    return total + toAmount(row.amount);
  }, 0);
  const available = Math.max(0, balance - pendingTotal);

  if (amount > available) {
    return sendJson(res, 400, {
      error: `You can withdraw up to ${available.toFixed(2)}.`
    });
  }

  const { data, error } = await auth.supabase
    .from("wallet_transactions")
    .insert({ user_id: auth.user.id, kind: "withdraw", amount, status: "pending" })
    .select("id, kind, amount, status, created_at")
    .single();

  if (error) {
    console.error("Supabase withdrawal request failed", error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to create the withdrawal request right now." });
  }

  return sendJson(res, 201, {
    transaction: {
      id: data.id,
      kind: data.kind,
      amount: Number(data.amount),
      status: data.status,
      created_at: data.created_at
    },
    message: "Withdrawal request created. It will be reviewed before payout."
  });
};
