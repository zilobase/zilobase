# @zilobase/license

Offline licensing for zilobase's open-core editions. Verifies signed license
tokens and turns them into `Entitlements` (`@zilobase/core-ports`) that the rest
of the app gates on. No network, no phone-home — air-gap safe.

## Concepts

- **Token** — `<base64url(payload)>.<base64url(ed25519-signature)>`.
- **Verification** — offline, using the embedded public key (`keys.ts`). The
  matching private key lives only in the private `license-gen` tool and is never
  committed.
- **Tier → feature policy** — `tiers.ts` is the single place that maps each tier
  to its features. Re-tiering is a one-line change here (Parnas: the volatile
  business decision is hidden behind one module).
- **Fail-safe** — a missing/malformed/expired token resolves to Community, so the
  app always boots.

## Usage

```ts
import { loadEntitlements } from "@zilobase/license";

// token from DB / admin upload / env; null on Community installs
const entitlements = loadEntitlements(licenseToken);

if (entitlements.has("sso.saml")) {
  // enable SAML SSO
}
if (!entitlements.withinSeatLimit(activeUserCount)) {
  // warn the admin they are over their seat count
}
```

Gate a route/feature with a single check:

```ts
if (!entitlements.has("audit.log")) {
  return c.json({ error: "upgrade_required" }, 402);
}
```

## Adding a premium feature

1. Add the flag to `Feature` in `@zilobase/core-ports`.
2. Add it to the right tier(s) in `tiers.ts`.
3. Build the feature and wrap its entry point in `entitlements.has(...)`.
4. Issue keys for that tier with the private `license-gen` tool.

## Issuing keys (manual, for now)

Signing happens outside shipped runtimes with the private key:

```ts
import { signLicense } from "@zilobase/license";

const token = signLicense(
  { v: 1, licenseId: "lic_123", customer: "Acme",
    tier: "enterprise", seats: 500, issuedAt: Date.now(), expiresAt: null },
  process.env.ZILOBASE_LICENSE_PRIVATE_KEY!,
);
```

The production private key must live in a secret manager / HSM. Replace the dev
public key in `keys.ts` with the production public key before release.

## Test

```sh
node --test test/*.test.ts
```
