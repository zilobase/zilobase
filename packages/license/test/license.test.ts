import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { signLicense } from "../src/sign.ts";
import { verifyLicense, LicenseError } from "../src/verify.ts";
import { loadEntitlements, entitlementsFromPayload } from "../src/entitlements.ts";
import type { LicensePayload } from "../src/payload.ts";

function devKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    licenseId: "lic_1",
    customer: "Acme",
    tier: "professional",
    seats: 25,
    issuedAt: 1_000,
    expiresAt: null,
    ...over,
  };
}

test("sign -> verify round trip", () => {
  const { publicKeyPem, privateKeyPem } = devKeys();
  const token = signLicense(payload(), privateKeyPem);
  const result = verifyLicense(token, { publicKeyPem });
  assert.equal(result.customer, "Acme");
  assert.equal(result.tier, "professional");
  assert.equal(result.seats, 25);
});

test("professional tier grants SSO but not SCIM or audit", () => {
  const ent = entitlementsFromPayload(payload({ tier: "professional" }));
  assert.equal(ent.has("sso.saml"), true);
  assert.equal(ent.has("scim"), false);
  assert.equal(ent.has("audit.log"), false);
});

test("enterprise tier grants audit, SCIM, and white-label", () => {
  const ent = entitlementsFromPayload(payload({ tier: "enterprise", seats: 500 }));
  assert.equal(ent.has("audit.log"), true);
  assert.equal(ent.has("scim"), true);
  assert.equal(ent.has("branding.white_label"), true);
});

test("seat limit is enforced", () => {
  const ent = entitlementsFromPayload(payload({ seats: 25 }));
  assert.equal(ent.withinSeatLimit(25), true);
  assert.equal(ent.withinSeatLimit(26), false);
});

test("null seats means unlimited", () => {
  const ent = entitlementsFromPayload(payload({ seats: null }));
  assert.equal(ent.withinSeatLimit(1_000_000), true);
});

test("add-on features extend tier defaults", () => {
  const ent = entitlementsFromPayload(
    payload({ tier: "professional", features: ["audit.log"] }),
  );
  assert.equal(ent.has("audit.log"), true);
  assert.equal(ent.has("sso.saml"), true);
});

test("a tampered token is rejected", () => {
  const { publicKeyPem, privateKeyPem } = devKeys();
  const token = signLicense(payload(), privateKeyPem);
  const tampered = `${token.slice(0, -3)}aaa`;
  assert.throws(() => verifyLicense(tampered, { publicKeyPem }), LicenseError);
});

test("a token signed by a different key is rejected", () => {
  const a = devKeys();
  const b = devKeys();
  const token = signLicense(payload(), a.privateKeyPem);
  assert.throws(() => verifyLicense(token, { publicKeyPem: b.publicKeyPem }), LicenseError);
});

test("an expired token throws in verify", () => {
  const { publicKeyPem, privateKeyPem } = devKeys();
  const token = signLicense(payload({ expiresAt: 5_000 }), privateKeyPem);
  assert.throws(
    () => verifyLicense(token, { publicKeyPem, now: 6_000 }),
    /expired/i,
  );
});

test("loadEntitlements fails safe to Community on a bad token", () => {
  const ent = loadEntitlements("garbage.token");
  assert.equal(ent.tier, "community");
  assert.equal(ent.has("sso.saml"), false);
  assert.equal(ent.withinSeatLimit(1_000_000), true);
});

test("loadEntitlements returns Community when no token is present", () => {
  assert.equal(loadEntitlements(null).tier, "community");
  assert.equal(loadEntitlements(undefined).tier, "community");
});
