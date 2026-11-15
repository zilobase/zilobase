import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ assert, loadModule, sourcePath, test }) {
  test("route errors keep desktop reconnect copy off the web", async () => {
    const { describeRouteError } = await loadModule("/src/app/routing/route-error-page.tsx");
    const networkError = Object.assign(new Error("Zilobase is offline."), {
      name: "NetworkUnavailableError",
    });

    assert.deepEqual(
      describeRouteError(new Error("boom"), {
        isDesktop: false,
        selectedServer: null,
      }),
      {
        description: "Please try again.",
        showChangeServer: false,
        title: "Something went wrong",
      },
    );

    assert.deepEqual(
      describeRouteError(networkError, {
        isDesktop: false,
        selectedServer: null,
      }),
      {
        description: "Check your connection and try again.",
        showChangeServer: false,
        title: "Couldn't connect to Zilobase",
      },
    );

    assert.deepEqual(
      describeRouteError(networkError, {
        isDesktop: true,
        selectedServer: null,
      }),
      {
        description: "Your desktop session is still saved. Check your connection and try again.",
        showChangeServer: false,
        title: "Couldn't connect to Zilobase",
      },
    );

    assert.deepEqual(
      describeRouteError(new Error("boom"), {
        isDesktop: true,
        selectedServer: { apiOrigin: "https://api.zilobase.com" },
      }),
      {
        description:
          "Your desktop session is still saved. Check your connection, or connect to a different server.",
        showChangeServer: true,
        title: "Couldn't connect to Zilobase",
      },
    );
  });

  test("route error profile reads recover failed reads and stop after cleanup", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let fixture;
    let root;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
    try {
      fixture = await loadErrorSurface(sourcePath);
      const {
        RouteErrorPage,
        AuthenticatedRouteError,
        PendingPage,
        createElement,
        createRoot,
        flushSync,
        controls,
      } = fixture;
      window.location = {
        reload() {
          controls.reloads = (controls.reloads ?? 0) + 1;
        },
      };
      const profiles = [
        {
          active: true,
          server: {
            instanceId: "active",
            apiOrigin: "https://active.test",
            displayName: "Current",
          },
        },
        {
          active: false,
          server: { instanceId: "other", apiOrigin: "https://other.test", displayName: "Other" },
          hasCredentials: true,
          lastPath: "/p/page",
          lastActiveWorkspaceId: "workspace",
        },
      ];
      const render = () =>
        flushSync(() =>
          root.render(createElement(RouteErrorPage, { error: new Error("Offline") })),
        );
      const mount = () => {
        root = createRoot(document.getElementById("root"));
        render();
      };
      controls.profiles = Promise.resolve({ profiles });
      mount();
      await settle();
      assert.match(document.body.textContent, /Switch to Other/);
      assert.doesNotMatch(document.body.textContent, /Switch to Current/);
      const button = (text) =>
        [...document.querySelectorAll("button")].find((item) => item.textContent === text);
      button("Try again").click();
      assert.equal(controls.reloads, 1);
      button("Switch to Other").click();
      button("Change server").click();
      assert.equal(controls.switched.server, profiles[1].server);
      assert.equal(controls.switched.path, "/p/page");
      assert.deepEqual(controls.navigation, { to: "/connect" });
      flushSync(() => root.unmount());
      controls.profiles = Promise.reject(new Error("Storage unavailable"));
      mount();
      await settle();
      assert.doesNotMatch(document.body.textContent, /Switch to Other/);
      assert.match(document.body.textContent, /Try again/);
      flushSync(() => root.unmount());
      controls.profiles = Promise.resolve({ profiles: null });
      mount();
      await settle();
      assert.doesNotMatch(document.body.textContent, /Switch to/);
      flushSync(() => root.unmount());
      let resolveProfiles;
      controls.profiles = new Promise((resolve) => {
        resolveProfiles = resolve;
      });
      mount();
      controls.selected = null;
      render();
      resolveProfiles({ profiles });
      await settle();
      assert.doesNotMatch(document.body.textContent, /Switch to Other|Change server/);
      assert.equal(controls.reads, 4);
      flushSync(() => root.unmount());
      root = createRoot(document.getElementById("root"));
      flushSync(() => root.render(createElement(PendingPage)));
      assert.match(document.body.textContent, /Connecting to Zilobase/);
      assert.deepEqual(controls.diagnostics.at(-1), ["router.pending", { status: "started" }]);
      for (const resource of ["page", "database"]) {
        flushSync(() => root.render(createElement(AuthenticatedRouteError, { resource })));
        assert.match(
          document.body.textContent,
          new RegExp("This " + resource + " could not be opened"),
        );
        button("Try again").click();
      }
      assert.equal(controls.reloads, 3);
    } finally {
      if (root) fixture.flushSync(() => root.unmount());
      await settle();
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });

  test("routing surfaces preserve pending shell visibility and edition route matching", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let fixture;
    let root;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
    try {
      fixture = await loadErrorSurface(sourcePath);
      const { RootRouteShell, EditionRouteHost, createElement, createRoot, flushSync, controls } =
        fixture;
      root = createRoot(document.getElementById("root"));
      const render = (Component) => flushSync(() => root.render(createElement(Component)));
      const shellVisible = () => Boolean(document.querySelector("[data-app-shell]"));
      controls.matches = [{ routeId: "/app", status: "success" }];
      render(RootRouteShell);
      for (let attempt = 0; !shellVisible() && attempt < 100; attempt++) await settle();
      assert.equal(shellVisible(), true);
      controls.matches = [{ routeId: "/login", status: "pending" }];
      render(RootRouteShell);
      assert.equal(shellVisible(), true, "pending routes retain the last resolved shell");
      controls.matches[0].status = "success";
      render(RootRouteShell);
      assert.equal(shellVisible(), false);
      for (const [routeId, context, expected] of [
        ["/p/$pageId", { publishedShare: "app" }, true],
        ["/p/$pageId", { publishedShare: "public" }, false],
        ["/d/$databaseId", { publishedShare: "app" }, true],
        ["/m/$meetingId", { authenticatedMeeting: true }, true],
        ["/m/$meetingId", { authenticatedMeeting: false }, false],
      ]) {
        controls.matches = [{ routeId, context, status: "success" }];
        render(RootRouteShell);
        assert.equal(shellVisible(), expected);
      }
      controls.pathname = "/edition/billing";
      render(EditionRouteHost);
      assert.match(document.body.textContent, /Billing/);
      controls.pathname = "/edition/missing";
      render(EditionRouteHost);
      assert.match(document.body.textContent, /Edition page not found/);
    } finally {
      if (root) fixture.flushSync(() => root.unmount());
      await settle();
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadErrorSurface(sourcePath) {
  const mocks = {
    "@zilobase/edition-web": `import { createElement } from "react"; export const editionWebModule = { routePrefix: "/edition", routes: [{ path: "/billing", component: () => createElement("div", null, "Billing") }] };`,
    "@/components/ui/spinner": `import { createElement } from "react"; export const Spinner = props => createElement("span", props);`,
    "@/app/shell/components/document-favicon": `export const DocumentFavicon = () => null;`,
    "@/app/shell/app-shell": `import { createElement } from "react"; export const AppShell = ({ children }) => createElement("div", { "data-app-shell": true }, children);`,
    "error-test-ports": `export const controls = { selected: { instanceId: "active" }, reads: 0, diagnostics: [] };`,
    "@tanstack/react-router": `import { controls } from "error-test-ports"; export const useNavigate = () => options => { controls.navigation = options; }; export const Outlet = () => null; export const useRouterState = ({ select }) => select({ matches: controls.matches ?? [], location: { pathname: controls.pathname ?? "/" } });`,
    "@/platform/environment": `export const isDesktopApp = () => true;`,
    "@/platform/diagnostics/desktop-diagnostics": `import { controls } from "error-test-ports"; export const describeDesktopError = () => ({}); export const recordDesktopDiagnostic = (name, data) => { controls.diagnostics.push([name, data]); };`,
    "@/platform/server/desktop-server": `import { controls } from "error-test-ports"; export const getSelectedDesktopServer = () => controls.selected; export async function listDesktopServerProfiles() { controls.reads++; return await controls.profiles; } export async function executeDesktopServerSwitch(options) { controls.switched = options; }`,
    "@/platform/analytics/posthog": `export const captureProductException = () => {};`,
    "@/components/ui/button": `import { createElement } from "react"; export function Button({ variant, ...props }) { return createElement("button", props); }`,
  };
  mocks["@/platform/server/operations/desktop-server-switch"] =
    mocks["@/platform/server/desktop-server"];
  const result = await build({
    stdin: {
      contents: `export { default as RouteErrorPage } from "./route-error-page"; export { AuthenticatedRouteError, PendingPage, RootRouteShell, EditionRouteHost } from "./route-shell"; export { createElement } from "react"; export { createRoot } from "react-dom/client"; export { flushSync } from "react-dom"; export { controls } from "error-test-ports";`,
      resolveDir: sourcePath("/src/app/routing"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "error-surface-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            path in mocks ? { path, namespace: "error-mock" } : undefined,
          );
          builder.onLoad({ filter: /./, namespace: "error-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app/routing"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const tempDir = await mkdtemp(join(tmpdir(), "zilobase-route-error-"));
  try {
    const file = join(tempDir, "surface.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
