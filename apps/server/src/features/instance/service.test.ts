import assert from "node:assert/strict";
import { test } from "vitest";

import {
  getOrCreateInstanceSettings,
  getZilobaseDiscoveryDocument,
  isDesktopVersionCompatible,
  type InstanceSettingsRecord,
} from "./service";

const productionEnv = {
  BETTER_AUTH_URL: "https://api.example.com/",
  CLIENT_URL: "https://app.example.com/,tauri://localhost",
  ZILOBASE_MINIMUM_DESKTOP_VERSION: "0.0.29",
};

test("discovery publishes canonical identity, versions, and desktop endpoints", async () => {
  const document = await getZilobaseDiscoveryDocument(productionEnv, {
    async getInstanceSettings() {
      return {
        displayName: "Example Workspace",
        instanceId: "instance-1",
      };
    },
  });

  assert.deepEqual(document, {
    instanceId: "instance-1",
    displayName: "Example Workspace",
    issuer: "https://api.example.com",
    webOrigin: "https://app.example.com",
    apiOrigin: "https://api.example.com",
    protocolVersion: 1,
    serverVersion: "0.0.30",
    minimumDesktopVersion: "0.0.29",
    desktopAuthorization: {
      authorizationEndpoint: "https://app.example.com/desktop/authorize",
      tokenEndpoint: "https://api.example.com/api/auth/desktop/token",
    },
  });
});

test("instance initialization keeps the winning database identity under concurrency", async () => {
  let persisted: InstanceSettingsRecord | null = null;
  const repository = {
    async create(candidate: InstanceSettingsRecord) {
      await Promise.resolve();
      persisted ??= candidate;
    },
    async find() {
      await Promise.resolve();
      return persisted;
    },
  };

  const [first, second] = await Promise.all([
    getOrCreateInstanceSettings("First", repository),
    getOrCreateInstanceSettings("Second", repository),
  ]);
  const afterRestart = await getOrCreateInstanceSettings("Changed", repository);

  assert.equal(first.instanceId, second.instanceId);
  assert.deepEqual(afterRestart, first);
});

test("desktop compatibility requires protocol 1 and a sufficient semantic version", () => {
  const discovery = { minimumDesktopVersion: "1.4.0", protocolVersion: 1 as const };

  assert.equal(isDesktopVersionCompatible(discovery, "1.4.0"), true);
  assert.equal(isDesktopVersionCompatible(discovery, "1.5.0"), true);
  assert.equal(isDesktopVersionCompatible(discovery, "1.4.0-beta.1"), false);
  assert.equal(isDesktopVersionCompatible(discovery, "1.3.9"), false);
  assert.equal(isDesktopVersionCompatible(discovery, "invalid"), false);
  assert.equal(
    isDesktopVersionCompatible(
      { minimumDesktopVersion: "1.4.0-beta.2", protocolVersion: 1 },
      "1.4.0-beta.10",
    ),
    true,
  );
  assert.equal(
    isDesktopVersionCompatible({ ...discovery, protocolVersion: 2 as never }, "2.0.0"),
    false,
  );
});

test("discovery rejects malformed compatibility versions", async () => {
  await assert.rejects(
    getZilobaseDiscoveryDocument(
      { ...productionEnv, ZILOBASE_MINIMUM_DESKTOP_VERSION: "latest" },
      {
        async getInstanceSettings() {
          return { displayName: "Example", instanceId: "instance-1" };
        },
      },
    ),
    /minimum desktop version must be a semantic version/,
  );
});
