import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function register({ assert, sourcePath, test }) {
  let loaded;
  const runtime = () => (loaded ??= loadProviderRuntime(sourcePath));

  test("web session provider preserves persistence, offline recovery, errors and transport options", async () => {
    const { webAuthClient, controls } = await runtime();
    const session = { user: { id: "user" }, session: { id: "session" } };
    controls.reset();
    controls.responses["/session"] = session;
    const signal = new AbortController().signal;
    assert.equal(await webAuthClient.getSession(signal), session);
    assert.equal(controls.cached, session);
    assert.equal(controls.requestOptions.signal, signal);
    assert.equal(controls.requestOptions.timeoutMs, 15_000);
    assert.deepEqual(
      controls.diagnostics.map((item) => item.data.status),
      ["started", "success"],
    );
    controls.failures["session.write:deployment"] = new Error("Storage unavailable");
    assert.equal(await webAuthClient.getSession(), session);

    controls.reset();
    const failure = new Error("Network unavailable");
    controls.failures["request:/session"] = failure;
    controls.cached = session;
    await assert.rejects(webAuthClient.getSession(), (error) => error === failure);
    assert.ok(
      !controls.calls.includes("session.read"),
      "online failures do not restore an offline session",
    );
    controls.offline = true;
    assert.equal(await webAuthClient.getSession(), session);
    controls.failures["session.read"] = new Error("Cache unavailable");
    await assert.rejects(webAuthClient.getSession(), (error) => error === failure);
    controls.reset();
    controls.responses["/session"] = session;
    controls.offline = true;
    controls.cached = session;
    controls.failures["diagnostic:success"] = failure;
    assert.equal(
      await webAuthClient.getSession(),
      session,
      "synchronous adapter failures retain offline recovery",
    );
    controls.reset();
    const controller = new AbortController();
    const aborted = new DOMException("Cancelled", "AbortError");
    controller.abort(aborted);
    await assert.rejects(webAuthClient.getSession(controller.signal), (error) => error === aborted);
    controls.reset();
  });

  test("web sign-out preserves ordered cleanup and stops at the original failing step", async () => {
    const { webAuthClient, controls } = await runtime();
    const steps = [
      "session.read",
      "request:/api/auth/sign-out",
      "session.clear",
      "page.clear:user",
      "posthog.reset",
      "token.clear",
      "account.reset",
    ];
    const prepare = () => {
      controls.reset();
      controls.cached = { user: { id: "user" }, session: { id: "session" } };
      controls.responses["/api/auth/sign-out"] = { success: true };
    };
    prepare();
    assert.deepEqual(await webAuthClient.signOut(), { success: true });
    assert.deepEqual(controls.calls, steps);
    assert.equal(controls.cached, null);
    for (const [index, step] of steps.entries()) {
      prepare();
      const failure = new Error(step);
      controls.failures[step] = failure;
      await assert.rejects(webAuthClient.signOut(), (error) => error === failure);
      assert.deepEqual(controls.calls, steps.slice(0, index + 1));
    }
    controls.reset();
    await webAuthClient.signOut();
    assert.ok(!controls.calls.some((step) => step.startsWith("page.clear:")));
    controls.reset();
  });

  test("web demo provider rejects writes and preserves workspace reads", async () => {
    const { webAuthClient, controls } = await runtime();
    controls.reset();
    controls.demo = true;
    await assert.rejects(webAuthClient.signOut(), (error) => error === controls.demoError);
    await assert.rejects(
      webAuthClient.signInWithPassword({ email: "test@example.test", password: "test" }),
      (error) => error === controls.demoError,
    );
    assert.deepEqual(controls.calls, ["demo.guard", "demo.guard"]);
    const workspace = { id: "workspace", name: "Workspace", slug: "workspace" };
    controls.responses["/demo/bootstrap"] = { workspace };
    assert.deepEqual(await webAuthClient.listWorkspaces(), [workspace]);
    assert.deepEqual(await webAuthClient.listWorkspaceInvitations("workspace"), []);
    controls.reset();
  });

  test("auth command gate preserves all payloads, demo restrictions and failure identities", async () => {
    const { webAuthClient, controls } = await runtime();
    const commands = [
      [
        "requestSignInOtp",
        "test@example.test",
        "/email-otp/send-verification-otp",
        { email: "test@example.test", type: "sign-in" },
      ],
      ["signInWithOtp", { email: "test@example.test", otp: "123456" }, "/sign-in/email-otp"],
      [
        "signInWithPassword",
        { email: "test@example.test", password: "password" },
        "/sign-in/email",
      ],
      [
        "signUp",
        {
          email: "test@example.test",
          password: "password",
          name: "Name",
          invitationId: "invite id",
        },
        "/sign-up/email",
        {
          email: "test@example.test",
          password: "password",
          name: "Name",
          invitationId: "invite id",
          callbackURL: "/accept-invitation?id=invite%20id",
        },
      ],
      [
        "requestEmailVerificationOtp",
        "test@example.test",
        "/email-otp/send-verification-otp",
        { email: "test@example.test", type: "email-verification" },
      ],
      ["verifyEmailOtp", { email: "test@example.test", otp: "123456" }, "/email-otp/verify-email"],
      ["createWorkspace", { name: "Workspace", slug: "workspace" }, "/workspace/create"],
      ["setActiveWorkspace", "workspace", "/workspace/set-active", { workspaceId: "workspace" }],
      [
        "inviteWorkspaceMember",
        { email: "test@example.test", workspaceId: "workspace", role: "member" },
        "/workspace/invite-member",
      ],
      ["acceptWorkspaceInvitation", { invitationId: "invitation" }, "/workspace/accept-invitation"],
    ];
    for (const [name, input, path, body = input] of commands) {
      controls.reset();
      const response = { success: true, user: {}, token: "token" };
      controls.responses["/api/auth" + path] = response;
      assert.equal(await webAuthClient[name](input), response);
      assert.deepEqual(JSON.parse(controls.requestOptions.body), body);
      assert.equal(controls.requestOptions.method, "POST");
      assert.deepEqual(controls.calls, ["request:/api/auth" + path]);
      const failure = new Error(name);
      controls.failures["request:/api/auth" + path] = failure;
      await assert.rejects(webAuthClient[name](input), (error) => error === failure);
      controls.reset();
      controls.demo = true;
      await assert.rejects(webAuthClient[name](input), (error) => error === controls.demoError);
      assert.deepEqual(controls.calls, ["demo.guard"]);
    }
    controls.reset();
    await webAuthClient.signUp({ email: "test@example.test", name: "Name", password: "password" });
    assert.equal(JSON.parse(controls.requestOptions.body).callbackURL, "/onboarding");
    await webAuthClient.signUp({
      email: "test@example.test",
      name: "Name",
      password: "password",
      callbackURL: "/custom",
      invitationId: "invitation",
    });
    assert.equal(JSON.parse(controls.requestOptions.body).callbackURL, "/custom");
    const circular = {};
    circular.self = circular;
    assert.throws(
      () => webAuthClient.signUp(circular),
      TypeError,
      "synchronous request construction failures remain synchronous",
    );
    const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
    try {
      globalThis.window = { location: { search: "?client_id=client&scope=openid&state=state" } };
      await webAuthClient.signInWithPassword({ email: "test@example.test", password: "password" });
      assert.equal(
        JSON.parse(controls.requestOptions.body).oauth_query,
        "client_id=client&scope=openid&state=state",
      );
      await webAuthClient.signInWithOtp({ email: "test@example.test", otp: "123456" });
      assert.equal(
        JSON.parse(controls.requestOptions.body).oauth_query,
        "client_id=client&scope=openid&state=state",
      );
    } finally {
      if (saved) Object.defineProperty(globalThis, "window", saved);
      else delete globalThis.window;
    }
    controls.reset();
  });

  test("AppProviders preserve analytics ordering, theme updates and unload cleanup", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML(
      "<html><head><meta name='theme-color'></head><body><div id='root'></div></body></html>",
    );
    Object.assign(globalThis, { window, document });
    let fixture;
    let root;
    try {
      fixture = await runtime();
      const { AppProviders, createElement, createRoot, flushSync, StrictMode, controls } = fixture;
      controls.reset();
      globalThis.getComputedStyle = () => ({ backgroundColor: controls.background });
      const analytics = () => controls.calls.filter((call) => call.startsWith("posthog."));
      const render = () =>
        flushSync(() => root.render(createElement(AppProviders, null, "Content")));
      root = createRoot(document.getElementById("root"));
      render();
      assert.deepEqual(analytics(), [], "unknown sessions do not change analytics identity");
      assert.equal(document.documentElement.dataset.themeFamily, "default");
      assert.equal(document.documentElement.style.colorScheme, "light");
      assert.equal(document.querySelector("meta").getAttribute("content"), controls.background);
      assert.equal(controls.demoInstalls, 1);
      controls.queryValues[JSON.stringify(["test"])] = "cached";
      assert.equal(controls.demoCache.getQueryData(["test"]), "cached");

      controls.session = { user: { id: "first" } };
      controls.workspace = "workspace";
      render();
      assert.deepEqual(analytics(), [
        "posthog.identify:first",
        "posthog.group:workspace:workspace",
      ]);
      render();
      assert.equal(analytics().length, 2, "unchanged inputs do not repeat identity effects");
      controls.workspace = null;
      render();
      assert.equal(analytics().at(-1), "posthog.groups.reset");
      controls.distinctId = "external";
      controls.workspace = "another";
      render();
      assert.deepEqual(analytics().slice(-2), [
        "posthog.identify:first",
        "posthog.group:workspace:another",
      ]);
      controls.session = { user: { id: "second" } };
      render();
      assert.deepEqual(analytics().slice(-3), [
        "posthog.reset",
        "posthog.identify:second",
        "posthog.group:workspace:another",
      ]);
      controls.distinctId = "external";
      controls.session = { user: null };
      render();
      assert.equal(
        analytics().at(-1),
        "posthog.group:workspace:another",
        "sign-out does not reset an unrelated analytics identity",
      );
      controls.session = { user: { id: "second" } };
      render();
      controls.session = { user: null };
      render();
      assert.equal(analytics().at(-1), "posthog.reset");
      controls.enablePosthog(false);
      const count = analytics().length;
      controls.session = { user: { id: "disabled" } };
      render();
      assert.equal(analytics().length, count);

      controls.resolvedTheme = "dark";
      controls.themeFamily = "forest";
      controls.background = "rgb(20, 30, 40)";
      render();
      assert.equal(document.documentElement.dataset.themeFamily, "forest");
      assert.equal(document.documentElement.style.colorScheme, "dark");
      assert.equal(document.querySelector("meta").getAttribute("content"), controls.background);
      controls.resolvedTheme = undefined;
      controls.themeFamily = "ocean";
      render();
      assert.equal(
        document.documentElement.dataset.themeFamily,
        "forest",
        "unresolved appearance preserves the document theme",
      );
      document.querySelector("meta").remove();
      controls.resolvedTheme = "light";
      render();
      assert.equal(document.documentElement.dataset.themeFamily, "ocean");

      controls.pending = true;
      controls.subscriptions.forEach((callback) => callback());
      const blocked = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(blocked);
      assert.equal(blocked.defaultPrevented, true);
      assert.equal(blocked.returnValue, "");
      flushSync(() => root.unmount());
      assert.equal(controls.subscriptions.size, 0);
      const unblocked = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unblocked);
      assert.equal(unblocked.defaultPrevented, false);

      controls.reset();
      controls.pending = true;
      root = createRoot(document.getElementById("root"));
      flushSync(() =>
        root.render(createElement(StrictMode, null, createElement(AppProviders, null, "Content"))),
      );
      assert.equal(controls.subscriptions.size, 1);
      flushSync(() => root.unmount());
      assert.equal(controls.subscriptions.size, 0);
      assert.equal(
        controls.calls.filter((call) => call === "command.subscribe").length,
        controls.calls.filter((call) => call === "command.unsubscribe").length,
      );

      controls.reset();
      const failure = new Error("Analytics failed");
      controls.session = { user: { id: "failure" } };
      controls.failures["posthog.identify:failure"] = failure;
      let uncaught;
      root = createRoot(document.getElementById("root"), {
        onUncaughtError: (error) => {
          uncaught = error;
        },
      });
      render();
      assert.equal(uncaught, failure, "synchronous failures reach the React boundary unchanged");
      assert.equal(controls.subscriptions.size, 0);
    } finally {
      if (root) fixture.flushSync(() => root.unmount());
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });

  test("theme provider preserves document updates when local storage fails", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let root;
    try {
      const { ThemeFamilyProvider, useThemeFamily, createElement, createRoot, flushSync } =
        await runtime();
      const storageError = new Error("Storage unavailable");
      const values = new Map();
      let stored = "warm";
      let fail = false;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: () => {
            if (fail) throw storageError;
            return stored;
          },
          setItem: (key, value) => {
            if (fail) throw storageError;
            values.set(key, value);
          },
        },
      });
      let context;
      function Probe() {
        context = useThemeFamily();
        return null;
      }
      const mount = () => {
        root = createRoot(document.getElementById("root"));
        flushSync(() =>
          root.render(createElement(ThemeFamilyProvider, null, createElement(Probe))),
        );
      };
      mount();
      assert.equal(context.themeFamily, "warm");
      assert.equal(document.documentElement.dataset.themeFamily, "warm");
      fail = true;
      flushSync(() => context.setThemeFamily("forest"));
      assert.equal(context.themeFamily, "forest");
      assert.equal(document.documentElement.dataset.themeFamily, "forest");
      flushSync(() => root.unmount());
      mount();
      assert.equal(context.themeFamily, "default");
      flushSync(() => root.unmount());
      fail = false;
      stored = "rose";
      mount();
      assert.equal(context.themeFamily, "default");
      assert.ok([...values.values()].includes("default"));
    } finally {
      if (root) (await runtime()).flushSync(() => root.unmount());
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}

async function loadProviderRuntime(sourcePath) {
  const ports = `
    export const controls = {
      reset() { this.calls = []; this.failures = {}; this.responses = {}; this.diagnostics = []; this.cached = null; this.offline = false; this.demo = false; this.demoError = new Error("Demo read-only"); this.session = undefined; this.workspace = null; this.resolvedTheme = "light"; this.themeFamily = "default"; this.background = "rgb(255, 255, 255)"; this.queryValues = {}; this.distinctId = "anonymous"; this.enablePosthog?.(true); this.pending = false; this.subscriptions = new Set(); this.controller = { commandState: { hasPending: () => this.pending, subscribe: callback => { const subscriptions = this.subscriptions; subscriptions.add(callback); this.step("command.subscribe"); return () => { subscriptions.delete(callback); this.step("command.unsubscribe"); }; } } }; },
      step(name) { this.calls.push(name); if (this.failures[name]) throw this.failures[name]; }
    };
    controls.reset();
    export async function apiFetch(path, options = {}) { controls.step("request:" + path); controls.requestOptions = options; if (options.signal?.aborted) throw options.signal.reason; return controls.responses[path] ?? null; }
    export const webClientCacheStorage = { session: {
      async write(deployment, session) { controls.step("session.write:" + deployment); controls.cached = session; },
      async clear() { controls.step("session.clear"); controls.cached = null; }
    } };
    export async function readCachedSession(...args) { if (args.length) throw new Error("Unexpected session storage arguments"); controls.step("session.read"); return controls.cached; }
    export async function clearCachedSession(...args) { if (args.length) throw new Error("Unexpected session storage arguments"); controls.step("session.clear"); controls.cached = null; }
  `;
  const mocks = {
    "@/app/demo/components/demo-experience": `export { PassThrough as DemoExperience } from "app-provider-pass-through";`,
    "provider-test-ports": ports,
    "app-provider-pass-through": `export function PassThrough({ children }) { return children; } export const Empty = () => null;`,
    "next-themes": `import { controls } from "provider-test-ports"; export { PassThrough as ThemeProvider } from "app-provider-pass-through"; export const useTheme = () => ({ resolvedTheme: controls.resolvedTheme });`,
    "@/components/ui/sonner": `export { Empty as Toaster } from "app-provider-pass-through";`,
    "@/components/ui/tooltip": `export { PassThrough as TooltipProvider } from "app-provider-pass-through";`,
    "@/sections/pages/editor/comments/components/comments-context": `export { PassThrough as PageEditorCommentsProvider, PassThrough as PageCommentsRegistryProvider } from "app-provider-pass-through";`,
    "@/sections/pages/editor/runtime/components/page-editor-registry": `export { PassThrough as PageEditorRegistryProvider } from "app-provider-pass-through";`,
    "@/sections/desktop/updates/components/desktop-updater": `export { Empty as DesktopUpdater } from "app-provider-pass-through";`,
    "@/app/providers/features-provider": `export { PassThrough as WebFeaturesProvider } from "app-provider-pass-through";`,
    "@/app/providers/theme-family-provider": `import { controls } from "provider-test-ports"; export { PassThrough as ThemeFamilyProvider } from "app-provider-pass-through"; export const useThemeFamily = () => ({ themeFamily: controls.themeFamily });`,
    "@/components/icons": `export { PassThrough as AppIconProvider } from "app-provider-pass-through";`,
    "@/app/shortcuts/shortcut-provider": `export { PassThrough as ShortcutProvider } from "app-provider-pass-through";`,
    "@zilobase/features/auth/react": `import { controls } from "provider-test-ports"; export const useSession = () => ({ data: controls.session });`,
    "@zilobase/features/workspaces/react": `import { controls } from "provider-test-ports"; export const useActiveWorkspaceId = () => controls.workspace;`,
    "@zilobase/features/databases/react": `import { controls } from "provider-test-ports"; export const useDatabaseController = () => controls.controller;`,

    "@/platform/network/api": `export { apiFetch, apiFetch as apiStreamFetch } from "provider-test-ports"; import { controls } from "provider-test-ports"; export async function clearApiAuthToken() { controls.step("token.clear"); }`,
    "@/platform/storage/client-cache-storage": `export { webClientCacheStorage, readCachedSession, clearCachedSession } from "provider-test-ports";`,
    "@/platform/network/connectivity": `import { controls } from "provider-test-ports"; export const webClientLifecycle = {}; export const getConnectivityState = () => controls.offline ? "offline" : "online";`,
    "@/platform/diagnostics/desktop-diagnostics": `import { controls } from "provider-test-ports"; export const describeDesktopError = error => ({ message: error.message }); export function recordDesktopDiagnostic(name, data, level) { controls.diagnostics.push({ name, data, level }); if (controls.failures["diagnostic:" + data.status]) throw controls.failures["diagnostic:" + data.status]; }`,
    "@/app/query-client": `import { controls } from "provider-test-ports"; export const queryClient = { getQueryData: key => controls.queryValues[JSON.stringify(key)], getQueriesData: () => [] }; export const clientDeployment = () => "deployment";`,
    "@/app/state/app-store": `import { controls } from "provider-test-ports"; export function useAppStore(select) { return select({}); } useAppStore.getState = () => ({ resetAccountState() { controls.step("account.reset"); } });`,
    "@/app/demo/runtime": `import { controls } from "provider-test-ports"; export { PassThrough as DemoExperience } from "app-provider-pass-through"; export function installDemoCache(value) { controls.demoCache = value; controls.demoInstalls = (controls.demoInstalls ?? 0) + 1; } export const isHostedDemoRuntime = () => controls.demo; export function requestDemoGuard() { controls.step("demo.guard"); return controls.demoError; }`,
    "@/platform/analytics/posthog": `import { controls } from "provider-test-ports"; const posthog = { reset() { controls.step("posthog.reset"); controls.distinctId = "anonymous"; }, get_distinct_id: () => controls.distinctId, identify(id) { controls.step("posthog.identify:" + id); controls.distinctId = id; }, group(kind, id) { controls.step("posthog.group:" + kind + ":" + id); }, resetGroups() { controls.step("posthog.groups.reset"); } }; let client = posthog; controls.enablePosthog = enabled => { client = enabled ? posthog : null; }; export { client as default };`,
    "@/sections/pages/editor/collaboration/lib/page-document-cache": `import { controls } from "provider-test-ports"; export async function clearPageCacheForUser(id) { controls.step("page.clear:" + id); }`,
  };
  const result = await build({
    stdin: {
      contents: `export { webAuthClient } from "./features-provider"; export { AppProviders } from "./app-providers"; export { ThemeFamilyProvider, useThemeFamily } from "./theme-family-provider"; export { createElement, StrictMode } from "react"; export { createRoot } from "react-dom/client"; export { flushSync } from "react-dom"; export { controls } from "provider-test-ports";`,
      resolveDir: sourcePath("/src/app/providers"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    plugins: [
      {
        name: "provider-platform-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) => {
            if (path in mocks) return { path, namespace: "provider-mock" };
            if (path.startsWith("@/")) {
              const target = sourcePath(`/src/${path.slice(2)}`);
              return { path: existsSync(target + ".ts") ? target + ".ts" : target + ".tsx" };
            }
          });
          builder.onLoad({ filter: /./, namespace: "provider-mock" }, ({ path }) => ({
            contents: mocks[path],
            resolveDir: sourcePath("/src/app/providers"),
            loader: "ts",
          }));
        },
      },
    ],
  });
  const tempDir = await mkdtemp(join(tmpdir(), "zilobase-provider-"));
  try {
    const file = join(tempDir, "runtime.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
