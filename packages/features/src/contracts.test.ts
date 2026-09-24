import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));

test("published contracts have no runtime dependency on React or application modules", () => {
  const visited = new Set<string>();
  function inspect(path: string) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const name = specifier.text;
      assert.ok(
        !/^(react(?:\/|$)|@tanstack\/react-query|@\/|@zilobase\/server)/.test(name),
        `${path} imports ${name}`,
      );
      if (!name.startsWith(".")) continue;
      const base = resolve(dirname(path), name);
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync);
      assert.ok(target, `Unresolved contract import ${path}: ${name}`);
      inspect(target);
    }
  }
  for (const [name, entry] of Object.entries(manifest.exports)) {
    if (!name.endsWith("contracts") && !name.endsWith("-contract")) continue;
    inspect(
      resolve(packageRoot, typeof entry === "string" ? entry : (entry as { types: string }).types),
    );
  }
  assert.ok(visited.size > 10, "The test must cover the published contract modules");
});
