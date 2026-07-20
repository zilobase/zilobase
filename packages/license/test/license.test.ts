import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import { signLicense } from "../src/sign";
import { verifyLicense, isInGrace, LicenseError } from "../src/verify";
import {
  loadEntitlements,
  entitlementsFromPayload,
  createLicenseResolver,
} from "../src/entitlements";
import type { LicensePayload } from "../src/payload";

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

test("professional grants SSO but not SCIM or audit", () => {
  const ent = entitlementsFromPayload(payload({ tier: "professional" }));
  assert.equal(ent.has("sso.saml"), true);
  assert.equal(ent.has("scim"), false);
  assert.equal(ent.has("audit.log"), false);
});

test("enterprise grants audit, SCIM, and white-label", () => {
  const ent = entitlementsFromPayload(payload({ tier: "enterprise", seats: 500 }));
  assert.equal(ent.has("audit.log"), true);
  assert.equal(ent.has("scim"), true);
  assert.equal(ent.has("branding.white_label"), true);
});

test("atLeast() implements tier ordering", () => {
  const pro = entitlementsFromPayload(payload({ tier: "professional" }));
  assert.equal(pro.atLeast("community"), true);
  assert.equal(pro.atLeast("professional"), true);
  assert.equal(pro.atLeast("enterprise"), false);

  const ent = entitlementsFromPayload(payload({ tier: "enterprise" }));
  assert.equal(ent.atLeast("enterprise"), true);
});

test("isTrial flows through", () => {
  assert.equal(entitlementsFromPayload(payload({ isTrial: true })).isTrial, true);
  assert.equal(entitlementsFromPayload(payload()).isTrial, false);
});

test("seat limit is enforced; null seats = unlimited", () => {
  assert.equal(entitlementsFromPayload(payload({ seats: 25 })).withinSeatLimit(26), false);
  assert.equal(entitlementsFromPayload(payload({ seats: null })).withinSeatLimit(1e6), true);
});

test("add-on features extend tier defaults", () => {
  const ent = entitlementsFromPayload(payload({ tier: "professional", features: ["audit.log"] }));
  assert.equal(ent.has("audit.log"), true);
  assert.equal(ent.has("sso.saml"), true);
});

test("tampered and wrong-key tokens are rejected", () => {
  const a = devKeys();
  const b = devKeys();
  const token = signLicense(payload(), a.privateKeyPem);
  assert.throws(() => verifyLicense(`${token.slice(0, -3)}aaa`, { publicKeyPem: a.publicKeyPem }), LicenseError);
  assert.throws(() => verifyLicense(token, { publicKeyPem: b.publicKeyPem }), LicenseError);
});

test("expired past grace throws; inside grace still verifies", () => {
  const { publicKeyPem, privateKeyPem } = devKeys();
  const token = signLicense(
    payload({ expiresAt: 5_000, graceUntil: 10_000 }),
    privateKeyPem,
  );
  // inside grace window (expired but before graceUntil)
  assert.doesNotThrow(() => verifyLicense(token, { publicKeyPem, now: 7_000 }));
  assert.equal(isInGrace(verifyLicense(token, { publicKeyPem, now: 7_000 }), 7_000), true);
  // past grace
  assert.throws(() => verifyLicense(token, { publicKeyPem, now: 11_000 }), /expired/i);
});

test("no grace window => hard-stop at expiresAt", () => {
  const { publicKeyPem, privateKeyPem } = devKeys();
  const token = signLicense(payload({ expiresAt: 5_000 }), privateKeyPem);
  assert.throws(() => verifyLicense(token, { publicKeyPem, now: 6_000 }), /expired/i);
});

test("loadEntitlements fails safe to Community", () => {
  assert.equal(loadEntitlements("garbage.token").tier, "community");
  assert.equal(loadEntitlements(null).tier, "community");
  assert.equal(loadEntitlements(null).atLeast("professional"), false);
});

test("createLicenseResolver resolves instance-wide entitlements", async () => {
  const { publicKeyPem, privateKeyPem } = devKeys();
  const token = signLicense(payload({ tier: "enterprise", seats: 500 }), privateKeyPem);
  const resolver = createLicenseResolver(() => token, { publicKeyPem });
  const ent = await resolver.resolve({ workspaceId: "ws_ignored_on_selfhost" });
  assert.equal(ent.tier, "enterprise");
  assert.equal(ent.has("scim"), true);
});
