import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("navigation item commands preserve page/database mutations, locks and duplicate ordering", async () => {
    const modules = {
      "@tanstack/react-router":
        "export const useNavigate = () => runtime.navigate;",
      sonner:
        'export const toast = { error: value => runtime.calls.push(["error",value]), success: value => runtime.calls.push(["success",value]) };',
      "@/features/pages/layout":
        'export const useLayoutEditor = () => ({openLayoutEditor: input => runtime.calls.push(["layout",input])});',
      "@/features/databases/access/use-database-metadata":
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
        ${["DeleteDatabase", "SetDatabaseFavorite", "UpdateDatabase"].map((name) => `export const use${name} = () => runtime.mutations.${name};`).join("\n")}
      `,
      "@zilobase/features/user-settings/react":
        "export const useUserSettings = () => ({data:runtime.settings}); export const useUpdateUserSettings = () => runtime.mutations.UpdateUserSettings;",
    };
    const result = await build({
      stdin: {
        contents: `
      import { createElement } from "react";
      import { renderToString } from "react-dom/server";
      import { useNavigationItemActions } from "./src/features/sidebar/commands/use-navigation-item-actions";
      import { runtime } from "navigation-test-runtime";
      export function capture(input, dependencies) {
        Object.assign(runtime, dependencies);
        let actions;
        function Probe() { actions = useNavigationItemActions(input); return null; }
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
            build.onResolve({ filter: /.*/ }, (args) =>
              args.path === "navigation-test-runtime" || args.path in modules
                ? { path: args.path, namespace: "navigation-test" }
                : undefined,
            );
            build.onLoad(
              { filter: /.*/, namespace: "navigation-test" },
              ({ path }) => ({
                contents:
                  path === "navigation-test-runtime"
                    ? "export const runtime = {};"
                    : 'import { runtime } from "navigation-test-runtime";' +
                      modules[path],
                loader: "ts",
              }),
            );
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
    assert.deepEqual(calls.at(-1), [
      "UpdatePage",
      { id: "page", metadata: { locked: true, keep: "metadata" } },
    ]);
    const previousCount = calls.length;
    capture(undefined, { access: "view" }).lock.toggle();
    assert.equal(calls.length, previousCount);
    capture({ pageId: "page", meetingId: "meeting" }).lock.toggle();
    assert.equal(calls.at(-1)[1].metadata.meetingLocked, true);
    assert.equal(calls.at(-1)[1].metadata.locked, false);
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
      { databaseId: "db", config: { locked: false, keep: "config" } },
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
  });
}
