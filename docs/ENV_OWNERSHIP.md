# Env ownership (RESTRUCTURE_PLAN Pass 7)

- Canonical: `.env.development` (+ `.env.development.example` template).
  Self-host template: `.env.selfhost.example`.
- Secrets are dotenvx-encrypted in place (`encrypted:...`). `.env.keys`
  is NEVER committed (gitignored in all repos).
- Rule: add new vars to `.env.*.example` + `scripts/dev/config.mjs` (or the
  owning feature's docs) in the SAME commit. Never paste plaintext secrets
  into `.env.development` — encrypt via `npm run env:encrypt`.
- Satellite repos own their own env files; nothing here is read by
  sibling repos and vice versa.
