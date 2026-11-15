import ts from "typescript";
import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ readSource, sourcePath, assert, test }) {
  test("desktop workspace switcher groups current and other servers", async () => {
    const source =
      (await readSource("/src/app/shell/sidebar/components/app-sidebar.tsx")) +
      (await readSource("/src/app/shell/sidebar/hooks/sidebar-controller.ts"));
    assert.match(source, /isDesktopApp\(\)/);
    assert.match(source, /Connect another server/);
    assert.match(source, /OtherServerSection/);
    assert.match(source, /listDesktopServerProfiles/);
    assert.match(source, /executeDesktopServerSwitch/);
    assert.match(source, /isWorkspacePinned && !isDesktop/);
  });

  test("other-server rows are desktop-gated and web still has workspaces", async () => {
    const source =
      (await readSource("/src/app/shell/sidebar/components/app-sidebar.tsx")) +
      (await readSource("/src/app/shell/sidebar/hooks/sidebar-controller.ts"));
    assert.match(source, /Workspaces/);
    assert.match(source, /Add workspace/);
    assert.match(source, /isDesktop[\s\S]*otherProfiles\.map/);
  });
  test("workspace commands retain profile cleanup, debounced snapshots and ordered form completion", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    window.location = { pathname: "/p/page", search: "?view=current" };
    let fixture;
    let root;
    const settle = (delay = 10) => new Promise((resolve) => setTimeout(resolve, delay));
    try {
      fixture = await loadSwitcher(sourcePath);
      const { WorkspaceSwitcher, createElement, createRoot, flushSync, controls } = fixture;
      const deferred = () => {
        let resolve;
        const promise = new Promise((done) => {
          resolve = done;
        });
        return { promise, resolve };
      };
      let pending = deferred();
      controls.profiles = pending.promise;
      root = createRoot(document.getElementById("root"));
      const render = () => flushSync(() => root.render(createElement(WorkspaceSwitcher)));
      render();
      assert.equal(controls.reads, 1);
      pending.resolve({
        profiles: [
          {
            active: false,
            server: {
              instanceId: "other",
              displayName: "Other server",
              apiOrigin: "https://other.test",
            },
            workspaces: [],
            hasCredentials: true,
          },
        ],
      });
      await settle();
      assert.match(document.body.textContent, /Other server/);
      await settle(450);
      assert.deepEqual(controls.snapshots, [
        {
          lastActiveWorkspaceId: "workspace",
          lastPath: "/p/page?view=current",
          workspaces: [{ id: "workspace", name: "Workspace" }],
        },
      ]);

      Object.defineProperty(globalThis, "FormData", {
        configurable: true,
        value: class {
          get() {
            return " New workspace ";
          }
        },
      });
      const form = document.querySelector("form");
      form.reset = () => controls.calls.push("form.reset");
      let finish;
      controls.create = new Promise((resolve) => {
        finish = resolve;
      });
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      assert.deepEqual(controls.calls, ["create:New workspace"]);
      finish({ id: "new" });
      await settle();
      assert.deepEqual(controls.calls, ["create:New workspace", "form.reset", "navigate:/recents"]);
      controls.calls = [];
      controls.createFailure = new Error("Workspace creation denied");
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await settle();
      assert.deepEqual(controls.calls, ["create:New workspace"]);
      flushSync(() => root.unmount());

      pending = deferred();
      controls.profiles = pending.promise;
      root = createRoot(document.getElementById("root"));
      render();
      controls.desktop = false;
      render();
      pending.resolve({
        profiles: [
          {
            active: false,
            server: {
              instanceId: "stale",
              displayName: "Stale server",
              apiOrigin: "https://stale.test",
            },
            workspaces: [],
          },
        ],
      });
      await settle();
      controls.desktop = true;
      const next = deferred();
      controls.profiles = next.promise;
      render();
      assert.doesNotMatch(document.body.textContent, /Stale server/);
      next.resolve({ profiles: [] });
      await settle();
      flushSync(() => root.unmount());
      const written = controls.snapshots.length;
      await settle(450);
      assert.equal(controls.snapshots.length, written, "unmounted profile timers cannot write");
    } finally {
      if (root) fixture.flushSync(() => root.unmount());
      await settle();
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadSwitcher(sourcePath) {
  const part = (names) =>
    `import { createElement } from "react"; const Part = ({children, onClick}) => createElement("div", {onClick}, children); export { ${names.map((name) => `Part as ${name}`).join(", ")} };`;
  const mocks = {
    "switcher-ports": `export const controls = { desktop: true, reads: 0, snapshots: [], calls: [], workspaces: [{id:"workspace",name:"Workspace"}] };`,
    "@tanstack/react-router": `import { controls } from "switcher-ports"; export const useNavigate = () => options => { controls.calls.push("navigate:" + options.to); return Promise.resolve(); };`,
    "@/platform/environment": `import { controls } from "switcher-ports"; export const isDesktopApp = () => controls.desktop;`,
    "@/sections/desktop/servers/components/desktop-connect-server-dialog": `export const DesktopConnectServerDialog = () => null;`,
    "@/platform/network/api": `export const getApiErrorMessage = error => error.message;`,
    "@/platform/server/desktop-server": `import { controls } from "switcher-ports"; export const getSelectedDesktopServer = () => ({instanceId:"current",displayName:"Current",apiOrigin:"https://current.test"}); export async function listDesktopServerProfiles() { controls.reads++; return await controls.profiles; } export async function updateDesktopServerProfileSnapshot(input) { controls.snapshots.push(input); } export async function executeDesktopServerSwitch() {}`,
    "@zilobase/features/auth/react": `export const useSession = () => ({data:{workspacePinned:false}});`,
    "@zilobase/features/workspaces/react": `import { controls } from "switcher-ports"; export const useWorkspaces = () => ({data:controls.workspaces}); export const useActiveWorkspaceId = () => "workspace"; export const useSetActiveWorkspace = () => ({mutate(){}}); export const useCreateWorkspace = () => ({reset(){},async mutateAsync(name) { controls.calls.push("create:"+name); if (controls.createFailure) throw controls.createFailure; return await controls.create; }});`,
    "@/components/icons": part([
      "Building2Icon",
      "CheckIcon",
      "ChevronDownIcon",
      "PlusIcon",
      "ServerIcon",
      "Settings2Icon",
    ]),
    "@/components/ui/button": part(["Button"]),
    "@/components/ui/dialog": part([
      "Dialog",
      "DialogContent",
      "DialogDescription",
      "DialogFooter",
      "DialogHeader",
      "DialogTitle",
    ]),
    "@/components/ui/dropdrawer": part([
      "DropDrawer",
      "DropDrawerContent",
      "DropDrawerItem",
      "DropDrawerLabel",
      "DropDrawerSeparator",
      "DropDrawerShortcut",
      "DropDrawerTrigger",
    ]),
    "@/components/ui/sidebar": part(["SidebarMenu", "SidebarMenuButton", "SidebarMenuItem"]),
    "@/components/ui/field": part(["Field", "FieldError", "FieldGroup", "FieldLabel"]),
    "@/components/ui/input": part(["Input"]),
  };
  mocks["@/platform/server/operations/desktop-server-switch"] =
    mocks["@/platform/server/desktop-server"];
  const result = await build({
    stdin: {
      contents: await workspaceFixtureSource(sourcePath),
      loader: "tsx",
      resolveDir: sourcePath("/src/app/shell/sidebar"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "switcher-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            path in mocks ? { path, namespace: "switcher-mock" } : undefined,
          );
          builder.onLoad({ filter: /./, namespace: "switcher-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app/shell/sidebar"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), "zilobase-switcher-"));
  try {
    const path = join(directory, "runtime.mjs");
    await writeFile(path, result.outputFiles[0].text);
    return await import(pathToFileURL(path).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Exercise the real private renderer and controller without exporting test-only
// production APIs or initializing the rest of the application shell.
async function workspaceFixtureSource(sourcePath) {
  const names = new Set([
    "WorkspaceSwitcher",
    "SingleWorkspaceLabel",
    "MultiWorkspaceSwitcher",
    "OtherServerSection",
    "WorkspaceSettingsItem",
    "useSidebarWorkspaceIdentity",
    "useSidebarWorkspaceSummary",
    "useSidebarWorkspaceSwitcher",
    "readTriggerLabel",
    "serverSectionLabel",
    "getWorkspaceInitials",
  ]);
  const sources = await Promise.all(
    ["components/app-sidebar.tsx", "hooks/sidebar-controller.ts"].map(async (name) =>
      ts.createSourceFile(
        name,
        await readFile(sourcePath("/src/app/shell/sidebar/" + name), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      ),
    ),
  );
  const declarations = sources.flatMap((source) =>
    source.statements
      .filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
      .map((node) => node.getText(source)),
  );
  const used = new Set();
  const collect = (node) => {
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, collect);
  };
  collect(
    ts.createSourceFile(
      "fixture.tsx",
      declarations.join("\n"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  );
  const seen = new Set();
  const printer = ts.createPrinter();
  const imports = [];
  for (const source of sources)
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !node.importClause || node.importClause.isTypeOnly)
        continue;
      const clause = node.importClause;
      let bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        bindings = ts.factory.updateNamedImports(
          bindings,
          bindings.elements.filter((binding) => {
            const name = binding.name.text;
            if (binding.isTypeOnly || !used.has(name) || names.has(name) || seen.has(name))
              return false;
            seen.add(name);
            return true;
          }),
        );
      else if (bindings) {
        const name = bindings.name.text;
        if (!used.has(name) || seen.has(name)) bindings = undefined;
        else seen.add(name);
      }
      if (!bindings || (ts.isNamedImports(bindings) && !bindings.elements.length)) continue;
      imports.push(
        printer.printNode(
          ts.EmitHint.Unspecified,
          ts.factory.updateImportDeclaration(
            node,
            node.modifiers,
            ts.factory.updateImportClause(clause, clause.isTypeOnly, clause.name, bindings),
            node.moduleSpecifier,
            node.attributes,
          ),
          source,
        ),
      );
    }
  return (
    imports.join("\n") +
    "\n" +
    declarations.join("\n") +
    `\nexport {WorkspaceSwitcher}; export { createElement } from "react"; export { createRoot } from "react-dom/client"; export { flushSync } from "react-dom"; export { controls } from "switcher-ports";`
  );
}
