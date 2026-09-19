import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const workerAdapterApi = new URL(
  "./test/worker/workers/server-adapter-api.ts",
  import.meta.url,
).pathname;
const workerHocuspocus = new URL(
  "./test/worker/workers/hocuspocus-server.ts",
  import.meta.url,
).pathname;

export default defineConfig({
  resolve: {
    alias: {
      "@hocuspocus/server": workerHocuspocus,
      "@zilobase/server/adapter-api": workerAdapterApi,
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/worker/workers/wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/worker/workers/**/*.test.ts"],
    server: {
      deps: { inline: true },
    },
  },
});
