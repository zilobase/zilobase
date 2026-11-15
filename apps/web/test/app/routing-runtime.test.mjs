import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
export function register({ assert, sourcePath, test }) {
  let loaded;
  const runtime = () => (loaded ??= loadRoutingRuntime(sourcePath));
  test("routing preserves authentication, onboarding and public access decisions", async () => {
    const { router, guards, controls, NetworkUnavailableError } = await runtime();
    const route = (path) =>
      Object.values(router.routesById).find(
        (item) => item.fullPath === path && item.id !== "__root__" && item.id !== "/app",
      );
    const appRoute = router.routesById["/app"];
    const rejectsTo = (operation, to) =>
      assert.rejects(Promise.resolve().then(operation), (error) => error.options?.to === to);
    controls.reset();
    await rejectsTo(() => appRoute.options.beforeLoad(), "/login");
    controls.session = {
      user: { id: "user" },
      session: { id: "session", activeWorkspaceId: "workspace" },
    };
    controls.queryClient.clear();
    await rejectsTo(() => appRoute.options.beforeLoad(), "/onboarding");
    controls.workspaces = [{ id: "workspace", name: "Workspace", slug: "workspace" }];
    controls.queryClient.clear();
    await appRoute.options.beforeLoad();
    await rejectsTo(() => route("/settings").options.beforeLoad(), "/settings/preferences");
    await rejectsTo(() => route("/ai").options.beforeLoad(), "/recents");
    await rejectsTo(() => route("/connect").options.beforeLoad(), "/login");
    controls.desktop = true;
    route("/connect").options.beforeLoad();
    await rejectsTo(() => route("/otp").options.beforeLoad(), "/login");
    controls.reset();
    controls.responses["/pages/shared/published"] = { published: true };
    assert.equal(await guards.applyPageShareAccess("shared"), "public");
    controls.responses["/pages/shared/published"] = { published: false };
    await rejectsTo(() => guards.applyPageShareAccess("shared"), "/login");
    controls.session = { user: { id: "user" }, session: { id: "session" } };
    controls.queryClient.clear();
    await rejectsTo(() => guards.applyDatabaseShareAccess("shared"), "/onboarding");
    controls.offline = true;
    await assert.rejects(guards.applyPageShareAccess("shared"), NetworkUnavailableError);
    controls.reset();
  });
  test("synchronous route guards retain throws and OTP keeps its Promise boundary", async () => {
    const { router, controls } = await runtime();
    const route = (path) => Object.values(router.routesById).find((item) => item.fullPath === path);
    controls.reset();
    assert.throws(
      () => route("/connect").options.beforeLoad(),
      (error) => error.options.to === "/login",
    );
    controls.desktop = true;
    assert.equal(route("/connect").options.beforeLoad(), undefined);
    assert.throws(
      () => route("/settings").options.beforeLoad(),
      (error) => error.options.to === "/settings/preferences",
    );
    assert.throws(
      () => route("/ai").options.beforeLoad(),
      (error) => error.options.to === "/recents" && error.options.search.view === "recents",
    );
    controls.askAi = true;
    assert.equal(route("/ai").options.beforeLoad(), undefined);
    const otp = route("/otp").options.beforeLoad();
    assert.ok(otp instanceof Promise);
    await assert.rejects(otp, (error) => error.options.to === "/login");
    controls.desktop = false;
    assert.equal(await route("/otp").options.beforeLoad(), undefined);
    controls.reset();
  });

  test("routing preserves OAuth, signup, onboarding and demo redirects", async () => {
    const { router, guards, controls } = await runtime();
    const route = (path) =>
      Object.values(router.routesById).find(
        (item) => item.fullPath === path && item.id !== "__root__" && item.id !== "/app",
      );
    const redirected = async (path, input) => {
      try {
        await route(path).options.beforeLoad(input);
      } catch (error) {
        assert.ok(error.options, "expected a TanStack redirect");
        return error.options;
      }
      assert.fail("Expected redirect");
    };
    controls.reset();
    assert.equal(
      (await redirected("/login", { search: { error: "bootstrap_required" } })).to,
      "/setup",
    );
    assert.equal(controls.sessionReads, 0);
    assert.equal(await route("/login").options.beforeLoad({ search: {} }), undefined);
    assert.equal(await route("/signup").options.beforeLoad({ search: {} }), undefined);
    assert.equal(
      (await redirected("/oauth/consent", { search: { client_id: "client", scope: "openid" } })).to,
      "/login",
    );
    controls.session = { user: { id: "user" }, session: { id: "session" } };
    controls.queryClient.clear();
    const oauth = await redirected("/login", {
      search: { client_id: "client", scope: "openid", returnTo: "/recents" },
    });
    assert.equal(oauth.to, "/oauth/consent");
    assert.deepEqual(oauth.search, { client_id: "client", scope: "openid" });
    assert.equal((await redirected("/login", { search: { returnTo: "/p/page" } })).href, "/p/page");
    assert.equal(
      (await redirected("/signup", { search: { returnTo: "/p/page" } })).href,
      "/p/page",
    );
    assert.equal((await redirected("/signup", { search: {} })).to, "/onboarding");
    await route("/onboarding").options.beforeLoad();
    controls.workspaces = [{ id: "workspace", name: "Workspace", slug: "workspace" }];
    controls.queryClient.clear();
    assert.equal((await redirected("/onboarding")).to, "/recents");
    controls.demo = true;
    controls.responses["/demo/bootstrap"] = { startPath: "/p/demo" };
    assert.equal((await redirected("/")).href, "/p/demo");
    controls.reset();
    controls.responses["/databases/shared/published"] = { published: true };
    assert.deepEqual(
      await route("/d/$databaseId").options.beforeLoad({ params: { databaseId: "shared" } }),
      { publishedShare: "public" },
    );
    assert.deepEqual(await route("/m/$meetingId").options.beforeLoad(), {
      authenticatedMeeting: false,
    });
    controls.reset();
  });

  test("authentication route failures retain their identity", async () => {
    const { router, guards, controls } = await runtime();
    const routes = [
      router.routesById["/app"],
      ...["/", "/login", "/signup", "/onboarding", "/oauth/consent"].map((path) =>
        Object.values(router.routesById).find(
          (item) => item.fullPath === path && item.id !== "__root__" && item.id !== "/app",
        ),
      ),
    ];
    for (const route of routes) {
      controls.reset();
      const failure = new Error("Session read failed");
      controls.errors.session = failure;
      await assert.rejects(route.options.beforeLoad({ search: {} }), (error) => error === failure);
      assert.equal(controls.workspaceReads, 0);
    }
    for (const route of routes.filter((route) => route.fullPath !== "/oauth/consent")) {
      controls.reset();
      controls.session = { user: { id: "user" }, session: { id: "session" } };
      const failure = new Error("Workspace read failed");
      controls.errors.workspaces = failure;
      await assert.rejects(route.options.beforeLoad({ search: {} }), (error) => error === failure);
      assert.equal(controls.sessionReads, 1);
      assert.equal(controls.workspaceReads, 1);
    }
    controls.reset();
  });

  test("TanStack Router accepts guard redirects and resolved sharing context", async () => {
    const { router, controls, createMemoryHistory, createRouter } = await runtime();
    const load = async (path) => {
      const current = createRouter({
        ...router.options,
        history: createMemoryHistory({ initialEntries: [path] }),
      });
      await current.load();
      return current.state;
    };
    controls.reset();
    assert.equal((await load("/calendar")).redirect.options.to, "/login");
    controls.session = { user: { id: "user" }, session: { id: "session" } };
    controls.queryClient.clear();
    assert.equal((await load("/calendar")).redirect.options.to, "/onboarding");
    controls.workspaces = [{ id: "workspace", name: "Workspace", slug: "workspace" }];
    controls.queryClient.clear();
    const calendar = await load("/calendar?view=week");
    assert.equal(calendar.redirect, undefined);
    assert.equal(calendar.matches.at(-1).status, "success");
    assert.equal(calendar.matches.at(-1).search.view, "week");
    controls.reset();
    controls.responses["/pages/shared/published"] = { published: true };
    assert.equal((await load("/p/shared")).matches.at(-1).context.publishedShare, "public");
    controls.reset();
  });
  test("routing reuses fresh queries and preserves original failures", async () => {
    const { guards, controls, NetworkUnavailableError } = await runtime();
    controls.reset();
    const session = { user: { id: "user" }, session: { id: "session" } };
    controls.session = session;
    await guards.getFreshSession();
    await guards.getFreshSession();
    assert.equal(controls.sessionReads, 1);
    await guards.getWorkspaces();
    await guards.getWorkspaces();
    assert.equal(controls.workspaceReads, 1);
    controls.queryClient.setQueryData(["session"], session, { updatedAt: Date.now() - 31000 });
    await guards.getFreshSession();
    assert.equal(controls.sessionReads, 2);
    controls.reset();
    const offline = new NetworkUnavailableError();
    controls.errors.session = offline;
    assert.deepEqual(await guards.getFreshSession({ optional: true }), {
      user: null,
      session: null,
    });
    await assert.rejects(guards.getFreshSession(), (error) => error === offline);
    for (const failure of [
      new Error("Unexpected"),
      Object.assign(new Error("Forbidden"), { status: 403 }),
      new DOMException("Cancelled", "AbortError"),
    ]) {
      controls.errors.session = failure;
      await assert.rejects(
        guards.getFreshSession({ optional: true }),
        (error) => error === failure,
      );
      controls.errors.workspaces = failure;
      await assert.rejects(guards.getWorkspaces(), (error) => error === failure);
    }
    controls.reset();
  });
  test("routing keeps hydration optional and trusts only cached members offline", async () => {
    const { guards, controls, NetworkUnavailableError } = await runtime();
    const page = {
      id: "page",
      workspaceId: "workspace",
      name: "Page",
      type: "pageblock",
      url: "#",
      createdAt: "2026-10-12T00:00:00Z",
      updatedAt: "2026-10-12T00:00:00Z",
    };
    for (const viewerType of ["member", "guest", "public"]) {
      controls.reset();
      controls.session = { user: { id: "user" }, session: { id: "session" } };
      controls.responses["/pages/page"] = { page, viewerType, databaseIds: ["database"] };
      controls.storageError = new Error("Storage unavailable");
      assert.equal(
        await guards.applyPageShareAccess("page"),
        viewerType === "member" ? "app" : viewerType,
      );
      assert.equal(controls.hydrated.length, viewerType === "member" ? 1 : 0);
      if (viewerType === "member") {
        const { queryClient, ...input } = controls.hydrated[0];
        assert.equal(queryClient, controls.queryClient);
        assert.deepEqual(input, {
          userId: "user",
          sessionId: "session",
          pageId: "page",
          workspaceId: "workspace",
          databaseIds: ["database"],
        });
      }
      const requestCount = controls.requests.length;
      controls.offline = true;
      if (viewerType === "member") assert.equal(await guards.applyPageShareAccess("page"), "app");
      else await assert.rejects(guards.applyPageShareAccess("page"), NetworkUnavailableError);
      assert.equal(controls.requests.length, requestCount);
      assert.equal(controls.hydrated.length, viewerType === "member" ? 1 : 0);
    }
    controls.reset();
  });
  test("routing chooses the preferred workspace and recovers navigation failures", async () => {
    const { guards, controls } = await runtime();
    controls.reset();
    const session = {
      user: { id: "user" },
      session: { id: "session", activeWorkspaceId: "first" },
    };
    const workspaces = ["first", "preferred"].map((id) => ({ id, name: id, slug: id }));
    controls.preferredWorkspace = "preferred";
    const path = "/pages?fields=nav&workspaceId=preferred";
    controls.errors[path] = new Error("Navigation unavailable");
    assert.equal(await guards.getDefaultAppPath(session, workspaces), "/recents");
    assert.deepEqual(controls.requests, [path]);
    delete controls.errors[path];
    controls.responses[path] = { pages: [], databases: [], placements: [] };
    assert.equal(await guards.getDefaultAppPath(session, workspaces), "/recents");
    controls.queryClient.removeQueries({ queryKey: ["pages"] });
    controls.responses[path] = {
      pages: [
        {
          id: "recent page",
          workspaceId: "preferred",
          name: "Recent",
          type: "pageblock",
          url: "#",
          createdAt: "2026-10-12T00:00:00Z",
          updatedAt: "2026-10-12T00:00:00Z",
          lastVisitedAt: "2026-10-14T00:00:00Z",
        },
      ],
      databases: [],
      placements: [],
    };
    assert.equal(await guards.getDefaultAppPath(session, workspaces), "/p/recent%20page");
    assert.equal(await guards.getDefaultAppPath(session, []), "/recents");
    controls.reset();
  });
  test("routing preserves URL validation and disabled-feature redirects", async () => {
    const { router, controls } = await runtime();
    const route = (path) =>
      Object.values(router.routesById).find(
        (item) => item.fullPath === path && item.id !== "__root__" && item.id !== "/app",
      );
    controls.reset();
    assert.deepEqual(
      route("/calendar").options.validateSearch({ view: "agenda", date: "2026-02-30", days: "4" }),
      {
        align: undefined,
        days: 4,
        workspace: undefined,
        connection: undefined,
        view: "agenda",
        date: undefined,
        binding: undefined,
        calendar: undefined,
        event: undefined,
      },
    );
    assert.deepEqual(route("/recents").options.validateSearch({ view: "trash" }), {
      view: "trash",
    });
    assert.deepEqual(route("/d/$databaseId").options.validateSearch({ view: " view " }), {
      view: "view",
    });
    assert.deepEqual(route("/settings/team").options.validateSearch({ tab: "guests" }), {
      tab: "guests",
    });
    assert.throws(
      () => route("/trash").options.beforeLoad(),
      (error) => error.options.to === "/recents" && error.options.search.view === "trash",
    );
    controls.reset();
  });
}
async function loadRoutingRuntime(sourcePath) {
  // Use the real router, queries, collections and domain decisions with in-memory
  // platform ports. Screens are not mounted by these beforeLoad integration tests.
  const ports = `
    import { QueryClient } from "@tanstack/react-query";
    import { createZilobaseClient } from "@zilobase/features";
    const client = createZilobaseClient({ deployment: "routing-test", queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }) });
    export const controls = {
      queryClient: client.queryClient,
      reset() { this.queryClient.clear(); this.session = { user: null, session: null }; this.workspaces = []; this.errors = {}; this.responses = {}; this.requests = []; this.sessionReads = 0; this.workspaceReads = 0; this.desktop = false; this.offline = false; this.demo = false; this.askAi = false; this.hydrated = []; this.storageError = null; this.preferredWorkspace = null; }
    };
    controls.reset();
    export class NetworkUnavailableError extends Error { constructor() { super("Offline"); this.name = "NetworkUnavailableError"; } }
    export async function apiFetch(path) { controls.requests.push(path); if (controls.errors[path]) throw controls.errors[path]; return controls.responses[path] ?? null; }
    export const webAuthClient = {
      async getSession() { controls.sessionReads++; if (controls.errors.session) throw controls.errors.session; return controls.session; },
      async listWorkspaces() { controls.workspaceReads++; if (controls.errors.workspaces) throw controls.errors.workspaces; return controls.workspaces; }
    };
  `;
  const mocks = {
    "routing-test-ports": ports,
    "@/app/query-client": `export { controls } from "routing-test-ports"; import { controls } from "routing-test-ports"; export const queryClient = controls.queryClient;`,
    "@/app/providers/features-provider": `export { webAuthClient } from "routing-test-ports";`,
    "@/platform/network/api": `export { apiFetch, NetworkUnavailableError } from "routing-test-ports";`,
    "@/app/state/app-store": `import { controls } from "routing-test-ports"; export const useAppStore = { getState: () => ({ activeWorkspaceId: controls.preferredWorkspace }) };`,
    "@/platform/network/connectivity": `import { controls } from "routing-test-ports"; export const getConnectivityState = () => controls.offline ? "offline" : "online";`,
    "@/sections/pages/lib/page-read-cache": `import { controls } from "routing-test-ports"; export async function hydratePageReadCache(input) { controls.hydrated.push(input); if (controls.storageError) throw controls.storageError; }`,
    "@/platform/environment": `import { controls } from "routing-test-ports"; export const isFeatureEnabled = () => controls.askAi; export const isDesktopApp = () => controls.desktop;`,
    "@/app/demo/runtime": `import { controls } from "routing-test-ports"; export const isHostedDemoRuntime = () => controls.demo;`,
    "@zilobase/edition-web": `export const editionWebModule = { routePrefix: "/edition", routes: [] };`,
    "./route-shell": `export const PendingPage = () => null; export const RootRouteShell = () => null; export const EditionRouteHost = () => null;`,
    "./route-error-page": `export default () => null;`,
  };
  const result = await build({
    stdin: {
      contents: `export { router } from "./router"; export { createMemoryHistory, createRouter } from "@tanstack/react-router"; export * as guards from "./guards"; export { controls, NetworkUnavailableError } from "routing-test-ports";`,
      resolveDir: sourcePath("/src/app/routing"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    define: {
      "import.meta.env": JSON.stringify({ DEV: false, VITE_API_URL: "https://api.zilobase.test" }),
    },
    plugins: [
      {
        name: "routing-platform-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path, kind }) => {
            if (path in mocks) return { path, namespace: "routing-mock" };
            if (path.startsWith("@/sections/") && kind === "dynamic-import")
              return { path: "screen", namespace: "routing-mock" };
            if (path.startsWith("@/")) return { path: sourcePath(`/src/${path.slice(2)}.ts`) };
          });
          builder.onLoad({ filter: /./, namespace: "routing-mock" }, ({ path }) => ({
            contents: mocks[path] ?? "export default () => null;",
            resolveDir: sourcePath("/src/app/routing"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const tempDir = await mkdtemp(join(tmpdir(), "zilobase-routing-"));
  try {
    const file = join(tempDir, "runtime.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
