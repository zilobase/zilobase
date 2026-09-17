import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("item sharing preserves guest grants, database access coercion and publication permissions", async () => {
    const queryValues = {
      useSession: "session",
      usePage: "page",
      usePageAccessLevel: "accessLevel",
      usePageAccess: "pageAccess",
      useDatabase: "database",
      useDatabaseMetadata: "database",
      useDatabaseAccess: "databaseAccess",
      usePageAccessTargets: "targets",
      useAiAgentProfiles: "agents",
      usePagePersonAccessTargets: "people",
      usePageGuestInvitations: "invitations",
      usePageGuestRequests: "requests",
      useWorkspaceGuestPolicy: "guestPolicy",
    };
    const mutationNames = [
      "DeletePageAccess",
      "SetPagePublished",
      "UpsertPageAccess",
      "InvitePageGuest",
      "CancelPageGuestInvitation",
      "RevokePageGuest",
      "DeleteDatabaseAccess",
      "SetDatabasePublished",
      "UpsertDatabaseAccess",
    ];
    const controlledExports =
      Object.entries(queryValues)
        .map(
          ([name, key]) =>
            `export const ${name} = () => ({data:runtime.${key}});`,
        )
        .join("\n") +
      mutationNames
        .map(
          (name) =>
            `export const use${name} = () => runtime.mutations.${name};`,
        )
        .join("\n") +
      'export const useActiveWorkspaceId = () => "workspace";';
    const result = await build({
      stdin: {
        contents: `
      import {createElement} from "react";
      import {renderToString} from "react-dom/server";
      import {useItemSharing} from "./src/features/sidebar/commands/use-item-sharing";
      import {runtime} from "sharing-test-runtime";
      export function capture(input, dependencies, selection) {
        Object.assign(runtime,dependencies);
        let sharing, initialized=false;
        function Probe() {
          sharing=useItemSharing(input);
          if(selection && !initialized) {
            initialized=true;
            sharing.setTargetValue(selection.target);
            sharing.setNextAccessLevel(selection.level);
            sharing.setGuestEmail(selection.email ?? "");
          }
          return null;
        }
        renderToString(createElement(Probe));
        return sharing;
      }
    `,
        resolveDir: appPath("/"),
        sourcefile: "sharing-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-sharing",
          setup(build) {
            build.onResolve(
              {
                filter:
                  /^(sharing-test-runtime|sonner)$|^@zilobase\/features\/.*\/react$|^@\/features\/databases\/access\/use-database-metadata$/,
              },
              (args) => ({ path: args.path, namespace: "sharing-test" }),
            );
            build.onLoad(
              { filter: /.*/, namespace: "sharing-test" },
              ({ path }) => ({
                contents:
                  path === "sharing-test-runtime"
                    ? "export const runtime = {};"
                    : 'import {runtime} from "sharing-test-runtime";' +
                      (path === "sonner"
                        ? 'export const toast={success:value=>runtime.calls.push(["success",value]),error:value=>runtime.calls.push(["error",value])};'
                        : controlledExports),
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
    const mutations = Object.fromEntries(
      mutationNames.map((name) => [
        name,
        {
          isPending: false,
          mutate(input, options) {
            calls.push([name, input]);
            options?.onSuccess?.({ request: true });
          },
        },
      ]),
    );
    const base = {
      calls,
      mutations,
      session: { user: { id: "self", email: "self@test", name: "Self" } },
      page: { id: "page" },
      accessLevel: "full",
      pageAccess: { access: [] },
      database: null,
      databaseAccess: { access: [] },
      targets: {
        members: [
          { id: "self", name: "Self", email: "self@test" },
          { id: "member", name: "Member", email: "member@test" },
        ],
      },
      agents: [{ id: "agent", name: "Agent" }],
      people: { guests: [{ id: "guest", name: "Guest", email: "guest@test" }] },
      invitations: [
        { id: "pending", status: "pending" },
        { id: "accepted", status: "accepted" },
      ],
      requests: [{ id: "request", status: "pending" }],
      guestPolicy: { mode: "request", canApprove: false },
    };
    const capture = (input = { pageId: "page" }, overrides = {}, selection) =>
      module.exports.capture(input, { ...base, ...overrides }, selection);
    const sharing = capture();
    assert.equal(sharing.canManage, true);
    assert.equal(sharing.isWorkspaceMember, true);
    assert.equal(sharing.guestActionLabel, "Request");
    assert.deepEqual(
      sharing.shareableMembers.map((member) => member.id),
      ["member"],
    );
    assert.equal(
      sharing.targetByKey.get("user:guest").detail,
      "guest@test · Guest",
    );
    assert.deepEqual(
      sharing.pendingGuestInvitations.map((invite) => invite.id),
      ["pending"],
    );
    sharing.deleteRule({ id: "rule", targetId: "guest" });
    assert.deepEqual(calls.at(-1), [
      "RevokePageGuest",
      { pageId: "page", userId: "guest" },
    ]);
    sharing.deleteRule({ id: "rule", targetId: "member" });
    assert.deepEqual(calls.at(-1), [
      "DeletePageAccess",
      { pageId: "page", ruleId: "rule" },
    ]);
    const db = capture(
      { databaseId: "db" },
      { database: { database: { accessLevel: "full" } } },
      { target: "user:member", level: "comment" },
    );
    assert.equal(db.targetValue, "user:member");
    db.shareItem();
    assert.deepEqual(calls.at(-2), [
      "UpsertDatabaseAccess",
      {
        accessLevel: "view",
        targetId: "member",
        targetType: "user",
        databaseId: "db",
      },
    ]);
    db.deleteRule({ id: "db-rule", targetId: "guest" });
    assert.deepEqual(calls.at(-1), [
      "DeleteDatabaseAccess",
      { ruleId: "db-rule", databaseId: "db" },
    ]);
    const pageGrant = capture(
      undefined,
      {},
      { target: "agent:agent", level: "edit", email: " Guest@Example.Test " },
    );
    pageGrant.shareItem();
    assert.deepEqual(calls.at(-2), [
      "UpsertPageAccess",
      {
        accessLevel: "edit",
        targetId: "agent",
        targetType: "agent",
        pageId: "page",
      },
    ]);
    pageGrant.invitePageGuest();
    assert.deepEqual(calls.at(-2), [
      "InvitePageGuest",
      { accessLevel: "view", email: "guest@example.test", pageId: "page" },
    ]);
    assert.deepEqual(calls.at(-1), [
      "success",
      "Guest invitation sent for owner approval.",
    ]);
    calls.length = 0;
    capture(undefined, { accessLevel: "view" }).togglePublished(true);
    assert.deepEqual(calls, []);
    capture().togglePublished(true);
    assert.deepEqual(calls, [
      ["SetPagePublished", { isPublished: true, pageId: "page" }],
      ["success", "Page published."],
    ]);
    mutations.SetPagePublished.isPending = true;
    calls.length = 0;
    capture().togglePublished(false);
    assert.deepEqual(calls, []);
  });
}
