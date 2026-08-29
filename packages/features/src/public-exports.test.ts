import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedFeatureExports = [
  ".",
  "./ai-chat",
  "./ai-chat/agent-contract",
  "./ai-chat/apply-page-content-patch",
  "./ai-chat/tool-registry",
  "./api-keys",
  "./auth",
  "./databases",
  "./databases/property-types",
  "./meetings",
  "./pages",
  "./pages/content-state",
  "./pages/layouts",
  "./search",
  "./teamspaces",
  "./user-settings",
  "./user-settings/sidebar-config",
  "./workspaces",
];

const expectedPageContextExports = [
  ".",
  "./format-property-value",
  "./prosemirror-to-markdown",
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
