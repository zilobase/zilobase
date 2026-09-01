import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedFeatureExports = [
  ".",
  "./ai-chat",
  "./ai-chat/agent-contract",
  "./ai-chat/agent-icons",
  "./ai-chat/apply-page-content-patch",
  "./ai-chat/conversation-adapter",
  "./ai-chat/live-agent",
  "./ai-chat/tool-registry",
  "./api-keys",
  "./auth",
  "./databases",
  "./databases/filter",
  "./databases/formula",
  "./databases/property-types",
  "./databases/queries",
  "./mail",
  "./meetings",
  "./pages",
  "./pages/content-state",
  "./pages/layouts",
  "./pages/nav-delta",
  "./pages/navigation-realtime",
  "./pages/queries",
  "./search",
  "./teamspaces",
  "./user-settings",
  "./user-settings/sidebar-config",
  "./workspaces",
];

const expectedPageContextExports = [
  ".",
  "./build-database-markdown",
  "./extract-database-ids",
  "./format-property-value",
  "./insert-database-block",
  "./prosemirror-to-markdown",
  "./strip-database-payload",
  "./types",
];

test("workspace packages retain their published export specifiers", async () => {
  const features = await readPackageExports(new URL("../package.json", import.meta.url));
  const pageContext = await readPackageExports(
    new URL("../../page-context/package.json", import.meta.url),
  );

  assert.deepEqual(features, expectedFeatureExports);
  assert.deepEqual(pageContext, expectedPageContextExports);
});

async function readPackageExports(url: URL) {
  const manifest = JSON.parse(await readFile(url, "utf8")) as {
    exports: Record<string, unknown>;
  };

  return Object.keys(manifest.exports).sort();
}
