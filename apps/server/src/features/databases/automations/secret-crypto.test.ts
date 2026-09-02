import { describe, expect, it } from "vitest";

import { decryptAutomationSecret, encryptAutomationSecret } from "./secret-crypto";

const env = { AUTOMATION_SECRET_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };
const context = { ownerUserId: "user-1", purpose: "webhook_header", secretId: "secret-1", workspaceId: "workspace-1" };

describe("automation secret encryption", () => {
  it("round trips with context-bound AES-GCM and rejects ownership changes", async () => {
    const encrypted = await encryptAutomationSecret(env, "Bearer secret", context);
    expect(encrypted.ciphertext).not.toContain("secret");
    await expect(decryptAutomationSecret(env, encrypted, context)).resolves.toBe("Bearer secret");
    await expect(decryptAutomationSecret(env, encrypted, { ...context, ownerUserId: "user-2" })).rejects.toThrow();
  });
});
