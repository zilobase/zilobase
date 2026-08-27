import assert from "node:assert/strict";
import { test } from "vitest";

import {
  decryptAiProviderCredential,
  encryptAiProviderCredential,
} from "./ai-provider-credentials";

const key = Buffer.alloc(32, 7).toString("base64");

test("workspace AI credentials round-trip as versioned ciphertext", async () => {
  const encrypted = await encryptAiProviderCredential(
    { AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY: key },
    "sk-workspace-secret",
  );
  assert.equal(encrypted.keyVersion, "v1");
  assert.ok(!encrypted.ciphertext.includes("sk-workspace-secret"));
  assert.equal(
    await decryptAiProviderCredential(
      { AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY: key },
      encrypted,
    ),
    "sk-workspace-secret",
  );
});

test("workspace AI credentials reject an incorrect operator key", async () => {
  const encrypted = await encryptAiProviderCredential(
    { AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY: key },
    "sk-workspace-secret",
  );
  await assert.rejects(() => decryptAiProviderCredential(
    { AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64") },
    encrypted,
  ));
});
