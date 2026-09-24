import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { decryptMcpSecret, encryptMcpSecret } from "./credential-crypto";

const v1 = Buffer.alloc(32, 11).toString("base64");
const v2 = Buffer.alloc(32, 22).toString("base64");
const context = {
  authenticatedByUserId: "authenticator",
  connectionId: "connection",
  profileId: "profile",
  purpose: "connection_auth",
  workspaceId: "workspace",
};

describe("MCP credential encryption", () => {
  it("round-trips a secret and retains old keys across rotation", async () => {
    const encrypted = await encryptMcpSecret(
      {
        MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ activeVersion: "v1", keys: { v1 } }),
      },
      "provider-secret",
      context,
    );
    expect(encrypted.keyVersion).toBe("v1");
    expect(JSON.stringify(encrypted)).not.toContain("provider-secret");
    await expect(
      decryptMcpSecret(
        {
          MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ activeVersion: "v2", keys: { v1, v2 } }),
        },
        encrypted,
        context,
      ),
    ).resolves.toBe("provider-secret");
  });

  it("binds ciphertext to every AAD identity field", async () => {
    const env = {
      MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ activeVersion: "v1", keys: { v1 } }),
    };
    const encrypted = await encryptMcpSecret(env, "provider-secret", context);
    await expect(
      decryptMcpSecret(env, encrypted, {
        ...context,
        workspaceId: "different-workspace",
      }),
    ).rejects.toThrow();
  });

  it("rejects malformed and wrong-length keyrings", async () => {
    await expect(
      encryptMcpSecret({ MCP_CREDENTIAL_ENCRYPTION_KEYS: "not-json" }, "x", context),
    ).rejects.toThrow("valid JSON");
    await expect(
      encryptMcpSecret(
        {
          MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({
            activeVersion: "v1",
            keys: { v1: "dGlueQ==" },
          }),
        },
        "x",
        context,
      ),
    ).rejects.toThrow("32-byte key");
  });
});
