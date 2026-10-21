// Indian mobile numbers only, stored in the canonical 91XXXXXXXXXX form.
// Supabase Auth only supports email/phone login; phone login needs an SMS OTP
// provider, so we map the mobile number to a synthetic email and use
// password login to keep signup simple (no OTP / no verification step).
const COUNTRY_CODE = "91";
const PHONE_EMAIL_DOMAIN = "phone.shreeluxclubg.com";

function normalizePhone(value) {
  if (typeof value !== "string") return null;

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  let national = digits;
  if (national.length === 12 && national.startsWith(COUNTRY_CODE)) {
    national = national.slice(2);
  } else if (national.length === 11 && national.startsWith("0")) {
    national = national.slice(1);
  }

  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `${COUNTRY_CODE}${national}`;
}

function phoneToEmail(phone) {
  return `${phone}@${PHONE_EMAIL_DOMAIN}`;
}

module.exports = { normalizePhone, phoneToEmail };
