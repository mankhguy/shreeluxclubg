# ShreeLuxClubG frontend and API

The checked-in website is a static production bundle, not the original Vue source.
The old vendor bundle (`assets/js/index-74618ce8.js`) was built against a
third-party backend that this repository does not ship, so loading it crashed the
page; it is kept in the repository for rollback but its `<script>` tag in
`index.html` is commented out. The rendered markup, all 28 stylesheets, and the
full inline SVG sprite in `index.html` are untouched.

`assets/js/app.js` + `assets/css/app.css` are a small replacement runtime that
drives that same markup: bottom tabbar navigation, banner carousel, game tabs,
wallet, account settings, promotions/notices/terms pages, and login/register.
The API in this repository provides Supabase-backed signup, login, profile, and a
wallet ledger for deposit/withdraw requests.

Signup and login use **mobile number + password** (default country code `+91`).
Supabase Auth only supports email or phone identifiers, and phone signup would
require an SMS OTP provider, so the API maps the mobile number to a synthetic
email internally and uses password auth. Users never see or need an email, and
there is no OTP step.

## Supabase setup

1. Create a Supabase project.
2. In the SQL Editor, run
   `supabase/migrations/20261021000000_create_profiles.sql` and then
   `supabase/migrations/20261021010000_create_wallets.sql`.
3. In **Authentication → Sign In / Providers → Email**, turn **OFF** "Confirm
   email". This is required: the accounts use internal synthetic email addresses
   that cannot receive mail, so a confirmation link would make signup unusable.
4. In **Authentication → URL Configuration**, set the site URL and allowed
   redirect URLs to the deployed site.
5. Copy the project URL and publishable/anon key into the environment settings
   below. Never use a Supabase `service_role` key in this project or in browser
   code.

## Deploy with GitHub and Vercel

1. Push this repository to a private GitHub repository if it contains private
   business assets or configuration.
2. Import that repository in Vercel. Keep the project root at the repository
   root; Vercel serves `index.html` and deploys files under `api/` as functions.
3. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel's Environment Variables
   for Preview and Production. Use the values from `.env.example`.
4. Deploy, then check `/api/health`. It returns `200` when Supabase settings are
   present and `503` when configuration is missing.
5. Share the site root `/`. Login and registration open as an in-page sheet from
   the markup already in `index.html`. `register.html` is a separate
   self-contained mobile + password page and still works as a standalone link.

For local development, copy `.env.example` to `.env.local`, fill in the
Supabase project values, install dependencies with `npm install`, then run
`npx vercel dev`.

## API

- `POST /api/auth/signup` — JSON `{ "phone", "password", "display_name"? }`.
  `phone` accepts a 10 digit Indian mobile number, with or without `+91`/`0`
  prefix; it is stored as `91XXXXXXXXXX`. Returns `session: null` plus
  `email_confirmation_required: true` if Supabase email confirmation is still
  enabled (see Supabase setup step 3).
- `POST /api/auth/login` — JSON `{ "phone", "password" }`; returns a Supabase
  session.
- `POST /api/auth/refresh` — JSON `{ "refresh_token" }`; rotates and returns a
  Supabase session.
- `GET /api/profile/me` — requires `Authorization: Bearer <access_token>`.
- `PATCH /api/profile/me` — same authorization; JSON
  `{ "display_name": "..." }`.
- `POST /api/auth/password` — same authorization; JSON
  `{ "current_password", "new_password" }`. The current password is verified
  before Supabase Auth updates it.
- `GET /api/wallet/summary` — same authorization. Returns
  `{ "wallet": { "balance", "currency" }, "transactions": [...] }`.
- `POST /api/wallet/deposit` — same authorization; JSON `{ "amount" }`
  (`100`–`500000`). Creates a `pending` ledger entry.
- `POST /api/wallet/withdraw` — same authorization; JSON `{ "amount" }`.
  Validates the amount against the balance minus pending withdrawals, then
  creates a `pending` ledger entry.

Wallet reads and writes use the signed-in user's token and are constrained by
Supabase Row Level Security. Clients can only create their own `pending`
deposit/withdraw requests; `wallets.balance` is recalculated from `completed`
transactions by a database trigger, so a balance can never be credited from the
browser. Mark a transaction `completed` (dashboard, service key, or a future
admin API) to actually move the money.

Profile reads and updates use the signed-in user's token and are constrained by
Supabase Row Level Security. Passwords are handled by Supabase Auth; this API
does not store passwords.

## Frontend notes

`index.html` is a static server-rendered snapshot. Its markup is intentionally
left exactly as generated so the UI keeps every original detail. Behaviour comes
from `assets/js/app.js`, which:

- scales `rem` units the same way the original bundle did
  (`fontSize = min(clientWidth, 540) / 10`),
- repairs lazy-loaded images by mapping remote origins back to the local copies
  under `assets/media/` and `assets/png/`, falling back to a placeholder when a
  file is missing from this snapshot,
- drives the tabbar, banner carousel, game tabs, wallet, account, settings, and
  the first-deposit bonus dialog that are already present in the markup,
- talks only to the `/api/*` endpoints listed above.

The mirrored game and media assets still carry their original file names; replace
them with approved ShreeLuxClubG artwork before launch. Game providers, payments,
and real money movement are not implemented.

## Tests

Run `npm test` for the API helper tests.
