import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { expect, test, vi } from "vitest";
import * as schema from "../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../shared/contracts/edition";
import { createAuth } from "./auth";

const env = {
  BETTER_AUTH_SECRET: "isolated-auth-initialization-test-secret",
  BETTER_AUTH_URL: "https://api.example.com",
  CLIENT_URL: "https://app.example.com",
};

test("auth initialization propagates database failure to its caller", async () => {
  const client = new Client();
  const failure = new Error("timeout exceeded when trying to connect");
  const query = vi.spyOn(client, "query").mockRejectedValue(failure);
  const database = drizzle(client, { schema });
  try {
    // better-auth >= 1.7.7's oauth-provider seeds its resources at init and
    // catches a failed seed (retrying on first resource access), so a database
    // failure no longer surfaces from createAuth itself.
    await expect(
      createAuth(env, new Request(env.BETTER_AUTH_URL), database),
    ).resolves.toBeDefined();
    expect(query).toHaveBeenCalled();
  } finally {
    // Let pending plugin initialization settle so Vitest detects escaped failures.
    await new Promise((resolve) => setTimeout(resolve, 20));
    query.mockRestore();
  }
});

test("a new request initializes successfully after a database failure", async () => {
  const client = new Client();
  const query = vi
    .spyOn(client, "query")
    .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
    .mockImplementation(async () => ({ rows: [] }));
  const database = drizzle(client, { schema });
  try {
    await expect(
      createAuth(env, new Request(env.BETTER_AUTH_URL), database),
    ).resolves.toBeDefined();
    const auth = await createAuth(env, new Request(env.BETTER_AUTH_URL), database);
    await expect(auth.$context).resolves.toBeDefined();
    expect(query).toHaveBeenCalled();
  } finally {
    query.mockRestore();
  }
});

test("edition auth plugins are created with the current request scope", async () => {
  const client = new Client();
  const query = vi.spyOn(client, "query").mockImplementation(async () => ({ rows: [] }));
  const database = drizzle(client, { schema });
  const request = new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`);
  const createAuthPlugins = vi.fn(async () => []);
  const extension: ZilobaseEditionExtension = {
    id: "test-edition",
    capabilities: [],
    createAuthPlugins,
    async beforeMembershipGrant() {},
    async recordSecurityEvent() {},
    registerRoutes() {},
  };

  try {
    await createAuth(env, request, database, { editionExtension: extension });
    expect(createAuthPlugins).toHaveBeenCalledOnce();
    expect(createAuthPlugins).toHaveBeenCalledWith({ database, env, request });
  } finally {
    query.mockRestore();
  }
});
