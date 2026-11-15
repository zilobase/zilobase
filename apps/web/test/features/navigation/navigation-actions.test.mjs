import { build } from "esbuild";
import ts from "typescript";
import { createRequire } from "node:module";

export function register({ assert, appPath, readSource, test }) {
  test("navigation item commands preserve page/database mutations, locks and duplicate ordering", async () => {
    const modules = {
      "@tanstack/react-router":
        'export const useNavigate = () => runtime.navigate; export const useLocation = () => ({pathname:"/"});',
      "@/sections/desktop/tabs/components/desktop-tabs":
        "export const useOpenInNewTab = () => () => {};",
      "@/components/ui/sidebar": "export const useSidebar = () => ({isMobile:false});",
      "@zilobase/features/teamspaces/react": "export const useTeamspaces = () => ({data:[]});",
      sonner:
        'export const toast = { error: value => runtime.calls.push(["error",value]), success: value => runtime.calls.push(["success",value]) };',
      "@/sections/pages/design/components/page-design-editor":
        'export const usePageDesignEditor = () => ({openLayoutEditor: input => runtime.calls.push(["layout",input])});',
      "@/components/databases/access/use-database-metadata":
        "export const useDatabaseMetadata = () => ({data:runtime.database});",
      "@zilobase/features/workspaces/react":
        'export const useActiveWorkspaceId = () => "workspace";',
      "@zilobase/features/pages/react": `
        export const usePage = () => ({data:runtime.page});
        export const usePageNavigation = () => ({data:runtime.navigation});
        export const usePageAccessLevel = () => ({data:runtime.access});
        ${["CreatePage", "DeletePage", "SetPageFavorite", "UpdatePage"].map((name) => `export const use${name} = () => runtime.mutations.${name};`).join("\n")}
      `,
      "@zilobase/features/databases/react": `
        export const useDatabase = () => ({data:runtime.database});
        export const useDatabaseMetadata = () => ({data:runtime.database});
        ${["DeleteDatabase", "SetDatabaseFavorite", "UpdateDatabase"].map((name) => `export const use${name} = () => runtime.mutations.${name};`).join("\n")}
      `,
      "@zilobase/features/user-settings/react":
        "export const useUserSettings = () => ({data:runtime.settings}); export const useUpdateUserSettings = () => runtime.mutations.UpdateUserSettings;",
    };
    const actionHook = appPath("../../packages/features/src/pages/item-action-hooks.ts");
    const result = await build({
      stdin: {
        contents: `
      import { createElement } from "react";
      import { renderToString } from "react-dom/server";
      import { useHeaderActions } from "./src/components/navigation/hooks/use-navigation-actions";
      import { runtime } from "navigation-test-runtime";
      export function capture(input, dependencies) {
        Object.assign(runtime, dependencies);
        let actions;
        function Probe() { actions = useHeaderActions(input); return null; }
        renderToString(createElement(Probe));
        return actions;
      }
    `,
        resolveDir: appPath("/"),
        sourcefile: "navigation-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-navigation",
          setup(build) {
            build.onResolve({ filter: /^\// }, (args) =>
              args.path === actionHook ? { path: actionHook, namespace: "file" } : undefined,
            );
            build.onResolve({ filter: /^@zilobase\/features\/pages\/react$/ }, (args) =>
              args.importer.endsWith("use-navigation-actions.ts")
                ? { path: "combined-pages", namespace: "navigation-test" }
                : { path: actionHook },
            );
            const sharedModules = {
              "../workspaces/react": "@zilobase/features/workspaces/react",
              "./content-mutations": "@zilobase/features/pages/react",
              "./navigation-mutations": "@zilobase/features/pages/react",
              "./query-hooks": "@zilobase/features/pages/react",
              "../databases/mutations/databases": "@zilobase/features/databases/react",
              "../databases/queries/metadata": "@zilobase/features/databases/react",
              "../user-settings/react": "@zilobase/features/user-settings/react",
            };
            build.onResolve({ filter: /^\./ }, (args) =>
              args.importer === actionHook && args.path in sharedModules
                ? { path: sharedModules[args.path], namespace: "navigation-test" }
                : undefined,
            );

            build.onResolve({ filter: /.*/ }, (args) =>
              args.path === "navigation-test-runtime" || args.path in modules
                ? { path: args.path, namespace: "navigation-test" }
                : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: "navigation-test" }, ({ path }) => ({
              contents:
                path === "combined-pages"
                  ? `export {useItemActionController} from ${JSON.stringify(actionHook)}; import {runtime} from 'navigation-test-runtime'; export const useDeletePage=()=>runtime.mutations.DeletePage; export const useConvertPageToTeamspace=()=>({}); export const useMovePageToTeamspace=()=>({});`
                  : path === "navigation-test-runtime"
                    ? "export const runtime = {};"
                    : 'import { runtime } from "navigation-test-runtime";' + modules[path],
              loader: "ts",
            }));
          },
        },
      ],
    });
    const module = { exports: {} };
    new Function("require", "module", "exports", result.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports,
    );
    const calls = [];
    const names = [
      "CreatePage",
      "DeletePage",
      "SetPageFavorite",
      "UpdatePage",
      "DeleteDatabase",
      "SetDatabaseFavorite",
      "UpdateDatabase",
      "UpdateUserSettings",
    ];
    const mutations = Object.fromEntries(
      names.map((name) => [
        name,
        {
          isPending: false,
          mutate(input, options) {
            calls.push([name, input]);
            options?.onSuccess?.({});
          },
          async mutateAsync(input) {
            calls.push([name, input]);
            return { id: "copy" };
          },
        },
      ]),
    );
    const page = {
      id: "page",
      name: " Page ",
      content: {
        type: "doc",
        content: [{ type: "text", text: "Text", marks: [{ type: "comment" }] }],
      },
      metadata: { locked: false, keep: "metadata" },
      workspaceId: "workspace",
    };
    const dependencies = {
      calls,
      mutations,
      page,
      access: "edit",
      database: null,
      settings: { pageFullWidth: false },
      navigation: {
        pages: [],
        placements: [
          {
            itemKind: "page",
            itemId: "page",
            parentKind: "page",
            parentId: "parent",
            placementKind: "primary",
          },
        ],
      },
      navigate: async (input) => calls.push(["navigate", input]),
    };
    const capture = (input = { pageId: "page" }, overrides = {}) =>
      module.exports.capture(input, { ...dependencies, ...overrides });
    capture().lock.toggle();
    assert.deepEqual(calls.at(-1), ["UpdatePage", { id: "page", metadata: { locked: true } }]);
    const previousCount = calls.length;
    capture(undefined, { access: "view" }).lock.toggle();
    assert.equal(calls.length, previousCount);
    capture({ pageId: "page", meetingId: "meeting" }).lock.toggle();
    assert.equal(calls.at(-1)[1].metadata.meetingLocked, true);
    assert.equal(calls.at(-1)[1].metadata.locked, undefined);
    const database = {
      database: {
        id: "db",
        pageId: "page",
        name: "Database",
        accessLevel: "edit",
        config: { locked: true, keep: "config" },
        isFavorite: true,
      },
    };
    const dbActions = capture({ databaseId: "db" }, { database });
    dbActions.lock.toggle();
    assert.deepEqual(calls.at(-1), [
      "UpdateDatabase",
      { databaseId: "db", configuration: [{ operation: "set", path: ["locked"], value: false }] },
    ]);
    dbActions.favorite.toggle();
    assert.deepEqual(calls.at(-1), [
      "SetDatabaseFavorite",
      { databaseId: "db", isFavorite: false },
    ]);
    calls.length = 0;
    capture().moreMenu.run("Duplicate");
    await new Promise(setImmediate);
    assert.equal(calls[0][0], "CreatePage");
    assert.equal(calls[0][1].parentItemId, "parent");
    assert.equal(calls[0][1].name, "Page copy");
    assert.deepEqual(calls[0][1].content.content[0].marks, []);
    assert.equal(page.content.content[0].marks.length, 1);
    assert.deepEqual(calls.slice(1), [
      ["success", "Page duplicated."],
      ["navigate", { to: "/p/$pageId", params: { pageId: "copy" } }],
    ]);
    mutations.CreatePage.isPending = true;
    calls.length = 0;
    capture().moreMenu.run("Duplicate");
    await new Promise(setImmediate);
    assert.deepEqual(calls, []);
    mutations.CreatePage.isPending = false;
    mutations.CreatePage.mutateAsync = async () => {
      throw new Error("Denied");
    };
    capture().moreMenu.run("Duplicate");
    await new Promise(setImmediate);
    assert.deepEqual(calls, [["error", "Denied"]]);
    calls.length = 0;
    capture().trash.confirm();
    assert.deepEqual(calls, [
      ["DeletePage", "page"],
      ["success", "Moved to trash."],
      ["navigate", { to: "/" }],
    ]);
    calls.length = 0;
    mutations.CreatePage.mutateAsync = async () => ({ id: "copy" });
    dependencies.navigate = async (input) => {
      calls.push(["navigate", input]);
      throw new Error("Navigation failed");
    };
    capture().moreMenu.run("Duplicate");
    await new Promise(setImmediate);
    assert.deepEqual(calls, [
      ["success", "Page duplicated."],
      ["navigate", { to: "/p/$pageId", params: { pageId: "copy" } }],
      ["error", "Navigation failed"],
    ]);
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
      globalThis.window = { location: { origin: "https://app.test" } };
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          clipboard: { writeText: async (value) => calls.push(["clipboard", value]) },
        },
      });
      calls.length = 0;
      capture({ databaseId: "db" }, { database }).moreMenu.run("Copy Link");
      assert.deepEqual(calls, [["clipboard", "https://app.test/d/db"]]);
      await new Promise(setImmediate);
      assert.deepEqual(calls.at(-1), ["success", "Database link copied."]);
    } finally {
      if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
      else delete globalThis.window;
      if (savedNavigator) Object.defineProperty(globalThis, "navigator", savedNavigator);
      else delete globalThis.navigator;
    }
  });
  test("sidebar creation commands preserve guards, mutation/navigation order and exact failures", async () => {
    // Probe the real callbacks with their closed-over ports without mounting the
    // unrelated sidebar renderers or changing production exports for a test.
    const source = ts.createSourceFile(
      "app-sidebar.tsx",
      await readSource("/src/app/shell/sidebar/hooks/sidebar-controller.ts"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const names = new Set(["handleCreatePage", "handleCreateDatabase", "handleCreateChat"]);
    const declarations = [];
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && names.has(node.name.getText(source)))
        declarations.push("const " + node.getText(source) + ";");
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(declarations.length, 3);
    const compiled = ts.transpileModule(declarations.join("\n"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const capture = new Function(
      "ports",
      `const {React, workspaceId, isCreatingPage, isCreatingDatabase, createPage, createDatabase, navigate, sidebarScope, chatSelection, setOpenMobile} = ports; ${compiled}; return {handleCreatePage, handleCreateDatabase, handleCreateChat};`,
    );
    const calls = [];
    let failure;
    const ports = {
      React: { useCallback: (callback) => callback },
      sidebarScope: { current: "workspace" },
      workspaceId: "workspace",
      isCreatingPage: false,
      isCreatingDatabase: false,
      createPage: async (input) => {
        calls.push(["page", input]);
        if (failure) throw failure;
        return { id: "page" };
      },
      createDatabase: async (input) => {
        calls.push(["database", input]);
        if (failure) throw failure;
        return { database: { id: "database" } };
      },
      navigate: async (input) => calls.push(["navigate", input]),
      chatSelection: { select: (id) => calls.push(["selectChat", id]) },
      setOpenMobile: (open) => calls.push(["mobileSidebar", open]),
    };
    const pending = capture(ports).handleCreatePage("teamspace");
    assert.deepEqual(calls, [["page", { workspaceId: "workspace", teamspaceId: "teamspace" }]]);
    await pending;
    assert.deepEqual(calls[1], ["navigate", { params: { pageId: "page" }, to: "/p/$pageId" }]);
    calls.length = 0;
    await capture(ports).handleCreateDatabase("teamspace");
    assert.deepEqual(calls, [
      ["database", { standalone: true, workspaceId: "workspace", teamspaceId: "teamspace" }],
      [
        "navigate",
        { params: { databaseId: "database" }, search: { view: undefined }, to: "/d/$databaseId" },
      ],
    ]);
    for (const [method, flag] of [
      ["handleCreatePage", "isCreatingPage"],
      ["handleCreateDatabase", "isCreatingDatabase"],
    ]) {
      calls.length = 0;
      await capture({ ...ports, workspaceId: null })[method]();
      await capture({ ...ports, [flag]: true })[method]();
      assert.deepEqual(calls, []);
      failure = new Error("Mutation failed");
      await assert.rejects(capture(ports)[method](), (error) => error === failure);
      assert.equal(calls.length, 1);
      failure = undefined;
    }
    calls.length = 0;
    const navigationFailure = new Error("Navigation failed");
    await assert.rejects(
      capture({
        ...ports,
        navigate: async () => {
          throw navigationFailure;
        },
      }).handleCreatePage(),
      (error) => error === navigationFailure,
    );
    calls.length = 0;
    let finish;
    const scope = { current: "workspace" };
    const late = capture({
      ...ports,
      sidebarScope: scope,
      createPage: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    }).handleCreatePage();
    scope.current = "another workspace";
    finish({ id: "late-page" });
    await late;
    assert.deepEqual(calls, [], "a late creation must not navigate the next workspace");
    await capture(ports).handleCreateChat();
    assert.deepEqual(calls, [
      ["selectChat", null],
      ["mobileSidebar", false],
      ["navigate", { to: "/ai", search: { thread: undefined } }],
    ]);
  });
}
