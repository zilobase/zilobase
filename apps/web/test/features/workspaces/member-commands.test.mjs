import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("workspace member commands preserve invitation validation, expiration and removal confirmation", async () => {
    const result = await build({
      stdin: {
        contents: `
      import {createElement} from "react";
      import {renderToString} from "react-dom/server";
      import {useMemberAccess} from "./src/features/workspaces/members/commands/use-member-access";
      import {useMemberInvitation} from "./src/features/workspaces/members/commands/use-member-invitation";
      import {runtime} from "member-test-runtime";
      export function capture(kind,input,dependencies,draft,submit) {
        Object.assign(runtime,dependencies);
        let controls,seeded=false,submitted=false;
        function Probe() {
          controls=kind === "invite" ? useMemberInvitation(input) : useMemberAccess(input);
          if(draft && !seeded) {
            seeded=true;
            controls.changeRole(draft.role);
            if(kind === "invite") { controls.changeEmail(draft.email); controls.setAccessExpiresAt(draft.expiration); }
            else { controls.setDraftExpiration(draft.expiration); controls.setEditing(true); }
          } else if(submit && !submitted) {
            submitted=true;
            if(kind === "invite") controls.invite({preventDefault(){runtime.prevented++;}});
            else controls.save();
          }
          return null;
        }
        renderToString(createElement(Probe));
        return controls;
      }
    `,
        resolveDir: appPath("/"),
        sourcefile: "member-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-members",
          setup(build) {
            build.onResolve(
              { filter: /^(member-test-runtime|sonner|@zilobase\/features\/workspaces\/react)$/ },
              (args) => ({ path: args.path, namespace: "member-test" }),
            );
            build.onLoad({ filter: /.*/, namespace: "member-test" }, ({ path }) => ({
              contents:
                path === "member-test-runtime"
                  ? "export const runtime={};"
                  : 'import {runtime} from "member-test-runtime";' +
                    (path === "sonner"
                      ? 'export const toast={success:value=>runtime.calls.push(["success",value]),error:value=>runtime.calls.push(["error",value])};'
                      : ["InviteWorkspaceMember", "UpdateWorkspaceMember", "RemoveWorkspaceMember"]
                          .map((name) => `export const use${name}=()=>runtime.mutations.${name};`)
                          .join("\n")),
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
    const mutations = Object.fromEntries(
      ["InviteWorkspaceMember", "UpdateWorkspaceMember", "RemoveWorkspaceMember"].map((name) => [
        name,
        {
          isPending: false,
          mutate(input, options) {
            calls.push([name, input]);
            options?.onSuccess?.({});
          },
        },
      ]),
    );
    const dependencies = { calls, mutations, prevented: 0 };
    const capture = (kind, input, draft, submit = false) =>
      module.exports.capture(kind, input, dependencies, draft, submit);
    const invalid = capture(
      "invite",
      "workspace",
      { role: "member", email: "bad", expiration: "" },
      true,
    );
    assert.equal(invalid.emailError, "Enter a valid email address.");
    assert.deepEqual(calls, []);
    const successful = capture(
      "invite",
      "workspace",
      { role: "temporary", email: " Person@Example.Test ", expiration: "2030-04-05T12:34" },
      true,
    );
    assert.equal(calls[0][0], "InviteWorkspaceMember");
    assert.equal(calls[0][1].email, "Person@Example.Test");
    assert.equal(calls[0][1].role, "temporary");
    assert.equal(calls[0][1].accessExpiresAt, new Date("2030-04-05T12:34").toISOString());
    assert.equal(successful.email, "");
    assert.equal(successful.role, "member");
    assert.equal(successful.accessExpiresAt, "");
    assert.deepEqual(calls.at(-1), ["success", "Invitation sent."]);
    calls.length = 0;
    capture("invite", null, { role: "member", email: "person@example.test", expiration: "" }, true);
    assert.deepEqual(calls, [["error", "Select an workspace before inviting a teammate."]]);
    const input = {
      actorRole: "admin",
      canManage: true,
      workspaceId: "workspace",
      member: {
        id: "user",
        memberId: "membership",
        role: "owner",
        name: "Person",
        email: "person@example.test",
      },
    };
    assert.equal(capture("member", input).actorCanEdit, false);
    assert.equal(capture("member", { ...input, actorRole: "owner" }).actorCanEdit, true);
    calls.length = 0;
    const edited = capture(
      "member",
      { ...input, actorRole: "owner" },
      { role: "temporary", expiration: "2030-05-06T10:20" },
      true,
    );
    assert.deepEqual(calls[0], [
      "UpdateWorkspaceMember",
      {
        accessExpiresAt: new Date("2030-05-06T10:20").toISOString(),
        memberId: "membership",
        role: "temporary",
        workspaceId: "workspace",
      },
    ]);
    assert.equal(edited.editing, false);
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          confirm: (message) => {
            calls.push(["confirm", message]);
            return false;
          },
        },
      });
      calls.length = 0;
      capture("member", input).remove();
      assert.deepEqual(calls, [["confirm", "Remove Person from this workspace?"]]);
      globalThis.window.confirm = () => true;
      calls.length = 0;
      capture("member", input).remove();
      assert.deepEqual(calls, [
        ["RemoveWorkspaceMember", { memberId: "membership", workspaceId: "workspace" }],
        ["success", "Member removed."],
      ]);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else delete globalThis.window;
    }
  });
}
