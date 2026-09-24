import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("bootstrap sends the one-time token only in headers and signs in after committed setup", async () => {
    const result = await build({
      stdin: {
        contents: `
   export {bootstrapInstance} from "./src/features/auth/setup/bootstrap-instance";
   export {runtime} from "bootstrap-test-runtime";
  `,
        resolveDir: appPath("/"),
        sourcefile: "bootstrap-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "bootstrap-runtime",
          setup(build) {
            build.onResolve(
              { filter: /^(bootstrap-test-runtime|@\/platform\/network\/api)$/ },
              (args) => ({ path: args.path, namespace: "bootstrap-test" }),
            );
            build.onLoad({ filter: /.*/, namespace: "bootstrap-test" }, ({ path }) => ({
              contents:
                path === "bootstrap-test-runtime"
                  ? "export const runtime={};"
                  : 'import {runtime} from "bootstrap-test-runtime";export const apiFetch=(...args)=>runtime.bootstrap(...args);export const authFetch=(...args)=>runtime.signIn(...args);',
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
    const { bootstrapInstance, runtime } = module.exports;
    const calls = [];
    const form = new FormData();
    for (const [key, value] of Object.entries({
      email: " Owner@Example.Test ",
      password: " secret ",
      name: " Owner ",
      workspaceName: " Team ",
      bootstrapToken: " private-token ",
    }))
      form.set(key, value);
    runtime.bootstrap = async (...args) => {
      calls.push(["bootstrap", ...args]);
    };
    runtime.signIn = async (...args) => {
      calls.push(["sign-in", ...args]);
    };
    await bootstrapInstance(form, () => calls.push(["completed"]));
    assert.deepEqual(calls, [
      [
        "bootstrap",
        "/api/instance/bootstrap",
        {
          auth: false,
          body: JSON.stringify({
            email: "owner@example.test",
            name: "Owner",
            password: " secret ",
            workspaceName: "Team",
          }),
          headers: { "x-zilobase-bootstrap-token": "private-token" },
          method: "POST",
        },
      ],
      ["completed"],
      ["sign-in", "/sign-in/email", { email: "owner@example.test", password: " secret " }],
    ]);
    calls.length = 0;
    runtime.bootstrap = async () => {
      throw new Error("already initialized");
    };
    await assert.rejects(
      bootstrapInstance(form, () => calls.push(["completed"])),
      /already initialized/,
    );
    assert.deepEqual(calls, []);
    runtime.bootstrap = async () => {};
    runtime.signIn = async () => {
      throw new Error("sign-in failed");
    };
    await assert.rejects(
      bootstrapInstance(form, () => calls.push(["completed"])),
      /sign-in failed/,
    );
    assert.deepEqual(calls, [["completed"]]);
  });
}
