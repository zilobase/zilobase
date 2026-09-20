import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baselinePath = join(root, "scripts/refactor/public-exports-baseline.json");
const packages = ["apps/server", "packages/features", "packages/html-to-page", "packages/page-context", "packages/markdown-text-splitter", "packages/runtime-ports", "packages/tiptap-comment-extension"];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith(".md") ? [path] : [];
  });
}

export function checkLinks(files) {
  return files.flatMap((file) => linkTargets(readFileSync(file, "utf8"))
    .flatMap((target) => checkTarget(file, target)));
}

function linkTargets(text) {
  const source = text.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "");
  const targets = [...source.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)]
    .map((match) => match[1].replace(/^<|>$/g, ""));
  return [...targets, ...[...source.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map((match) => match[1])];
}

function checkTarget(file, target) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return [];
  const [path, fragment] = target.split("#");
  const resolved = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
  if (!existsSync(resolved)) return [`${file}: missing ${target}`];
  if (!fragment || !resolved.endsWith(".md")) return [];
  return markdownAnchors(readFileSync(resolved, "utf8")).has(decodeURIComponent(fragment))
    ? [] : [`${file}: missing anchor ${target}`];
}

function markdownAnchors(text) {
  const headings = new Set();
  const counts = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const slug = match[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    headings.add(count ? `${slug}-${count}` : slug);
  }
  for (const match of text.matchAll(/(?:id|name)=["']([^"']+)["']/g)) headings.add(match[1]);
  return headings;
}

function exportLeaves(value, conditions = []) {
  if (typeof value === "string") return [{ conditions: conditions.join("/"), target: value }];
  if (!value || Array.isArray(value)) throw new Error("Expected a conditional export object or path");
  return Object.entries(value).flatMap(([key, target]) => exportLeaves(target, [...conditions, key]));
}

export function captureExports(repositoryRoot, packagePaths) {
  return Object.assign({}, ...packagePaths.map((path) => capturePackage(join(repositoryRoot, path))));
}

function capturePackage(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const configFile = ts.readConfigFile(join(directory, "tsconfig.json"), ts.sys.readFile);
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, directory);
  const entries = Object.entries(manifest.exports).flatMap(([subpath, exported]) =>
    exportLeaves(exported).map(({ conditions, target }) => ({
      key: `${manifest.name}:${subpath}:${conditions}`,
      source: sourceEntry(directory, target),
    })));
  const program = ts.createProgram([...new Set(entries.map((entry) => entry.source))], config.options);
  return Object.fromEntries(entries.map((entry) => [entry.key, exportedSymbols(program, entry)]));
}

function sourceEntry(directory, target) {
  // The splitter publishes build output; inspect its configured source entry.
  const sourceTarget = target.startsWith("./dist/")
    ? target.replace("./dist/", "./src/").replace(/(?:\.d)?\.ts$|\.js$/, ".ts")
    : target;
  const source = resolve(directory, sourceTarget);
  if (!existsSync(source)) throw new Error(`Missing published source ${source}`);
  return source;
}

function exportedSymbols(program, entry) {
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(entry.source);
  const module = file && checker.getSymbolAtLocation(file);
  if (!module) throw new Error(`Cannot resolve published module ${entry.key}`);
  return Object.fromEntries(checker.getExportsOfModule(module).map((symbol) => {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return [symbol.name, { value: Boolean(resolved.flags & ts.SymbolFlags.Value), type: Boolean(resolved.flags & ts.SymbolFlags.Type) }];
  }).sort(([a], [b]) => a.localeCompare(b)));
}

export function compareExports(baseline, current) {
  const errors = [];
  for (const [entry, symbols] of Object.entries(baseline)) {
    if (!current[entry]) { errors.push(`Removed export condition/subpath: ${entry}`); continue; }
    for (const [name, shape] of Object.entries(symbols)) {
      const next = current[entry][name];
      if (!next) errors.push(`Removed export: ${entry} ${name}`);
      else if ((shape.value && !next.value) || (shape.type && !next.type)) errors.push(`Changed export kind: ${entry} ${name}`);
    }
  }
  return errors;
}

function main() {
  const mode = process.argv[2] ?? "all";
  if (!["all", "links", "exports", "capture-exports"].includes(mode)) throw new Error("Expected all, links, exports or capture-exports");
  const errors = [];
  if (mode === "links" || mode === "all") {
    const files = [...markdownFiles(join(root, "architecture")), ...["AGENTS.md", "README.md", "CONTRIBUTING.md"].map((name) => join(root, name))];
    errors.push(...checkLinks(files));
    console.log(`Checked local links in ${files.length} architecture/contributor documents`);
  }
  if (mode !== "links") {
    const current = captureExports(root, packages);
    if (mode === "capture-exports") {
      if (existsSync(baselinePath)) throw new Error("Baseline already exists; review explicit compatibility changes instead of recapturing it");
      writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
    } else errors.push(...compareExports(JSON.parse(readFileSync(baselinePath, "utf8")), current));
    console.log(`Checked ${Object.keys(current).length} published export entry conditions`);
  }
  if (errors.length) {
    console.error(errors.map((error) => error.replaceAll(root, "")).join("\n"));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
