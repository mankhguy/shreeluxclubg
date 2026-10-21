const { getAuthenticatedClient } = require("../_lib/auth");
const { requireMethod, sendJson } = require("../_lib/http");

const DEFAULT_CURRENCY = "INR";
const TRANSACTION_LIMIT = 50;

function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

module.exports = async function walletSummary(req, res) {
  if (requireMethod(req, res, "GET")) return;

  const auth = await getAuthenticatedClient(req, res);
  if (!auth) return;

  const walletResult = await auth.supabase
    .from("wallets")
    .select("balance, currency")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (walletResult.error) {
    console.error("Supabase wallet lookup failed", walletResult.error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to load your wallet." });
  }

  const transactionsResult = await auth.supabase
    .from("wallet_transactions")
    .select("id, kind, amount, status, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(TRANSACTION_LIMIT);

  if (transactionsResult.error) {
    console.error("Supabase transaction lookup failed", transactionsResult.error.code || "unknown");
    return sendJson(res, 502, { error: "Unable to load your transactions." });
  }

  return sendJson(res, 200, {
    wallet: {
      balance: walletResult.data ? toAmount(walletResult.data.balance) : 0,
      currency: (walletResult.data && walletResult.data.currency) || DEFAULT_CURRENCY
    },
    transactions: (transactionsResult.data || []).map(function (row) {
      return {
        id: row.id,
        kind: row.kind,
        amount: toAmount(row.amount),
        status: row.status,
        created_at: row.created_at
      };
    })
  });
};
