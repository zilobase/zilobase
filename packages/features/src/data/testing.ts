import { normalizeDatabaseBootstrap } from "../databases/cache-references";
import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";
import { installSharedClient, sharedClient } from "./client";

/** Test composition mirrors the application's explicit session installation. */
export class TestQueryClient extends QueryClient {
  constructor(config?: QueryClientConfig) {
    super(config);
    installSharedClient(this, () => ({
      deployment: "https://local.zilobase.test",
      viewer: { kind: "account", accountId: "account", actorId: "actor", sessionId: "session" },
    }));
  }
  override clear() {
    sharedClient(this).clear();
    super.clear();
  }
}

export function cacheTestBootstrap(client: QueryClient, key: readonly unknown[], input: unknown) {
  return client.setQueryData(
    key,
    normalizeDatabaseBootstrap(
      client,
      sharedClient(client).capture(),
      String(key[2]),
      input,
      key[5] === true,
    ),
  );
}
