import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("teamspace management preserves principal payloads and sequential archive failure recovery", async () => {
    const result = await build({
      stdin: {
        contents: `
      import {createElement} from "react";
      import {renderToString} from "react-dom/server";
      import {useTeamspaceManagement} from "./src/features/teamspaces/commands/use-teamspace-management";
      import {useTeamspaceDirectory} from "./src/features/teamspaces/commands/use-teamspace-directory";
      import {runtime} from "teamspace-test-runtime";
      export function capture(kind,input,dependencies,draft) {
        Object.assign(runtime,dependencies);let controls,seeded=false;
        function Probe() {
          controls=kind==='manage'?useTeamspaceManagement(input):useTeamspaceDirectory();
          if(draft&&!seeded){seeded=true;if(kind==='manage')controls.setCandidateId(draft);else controls.setSelectedIds(new Set(draft));}
          return null;
        }
        renderToString(createElement(Probe));return controls;
      }
    `,
        resolveDir: appPath("/"),
        sourcefile: "teamspace-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-teamspaces",
          setup(build) {
            const sources = {
              "teamspace-test-runtime": "export const runtime={};",
              sonner:
                'export const toast={success:value=>runtime.calls.push(["success",value]),error:value=>runtime.calls.push(["error",value])};',
              "@/platform/network/api": "export const getApiErrorMessage=error=>error.message;",
              "@tanstack/react-router":
                'export const useLocation=()=>({pathname:"/settings/teamspaces",search:{}});export const useNavigate=()=>()=>{};',
              "@zilobase/features/workspaces/react":
                "export const useActiveWorkspaceId=()=>runtime.workspaceId;export const useWorkspaceAccessTargets=()=>({data:runtime.targets});",
              "@zilobase/features/teamspaces/react": [
                ...[
                  "AddTeamspacePrincipal",
                  "RemoveTeamspacePrincipal",
                  "TeamspaceLifecycle",
                  "UpdateTeamspace",
                  "UpdateTeamspacePrincipal",
                  "UpdateTeamspaceInviteLink",
                  "AcceptTeamspaceInvite",
                  "SetTeamspaceMembership",
                  "UpdateTeamspaceSettings",
                  "UpdateTeamspaceDefaults",
                ].map((name) => `export const use${name}=()=>runtime.mutations.${name};`),
                "export const useTeamspacePrincipals=()=>({data:runtime.principals});",
                "export const useTeamspaces=()=>({data:[],isPending:false});export const useArchivedTeamspaces=()=>({data:[]});export const useTeamspaceSettings=()=>({data:{canManage:true}});",
              ].join("\n"),
            };
            build.onResolve({ filter: /.*/ }, (args) =>
              Object.hasOwn(sources, args.path)
                ? { path: args.path, namespace: "teamspace-test" }
                : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: "teamspace-test" }, ({ path }) => ({
              contents:
                (path === "teamspace-test-runtime"
                  ? ""
                  : 'import {runtime} from "teamspace-test-runtime";') + sources[path],
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
      [
        "AddTeamspacePrincipal",
        "RemoveTeamspacePrincipal",
        "TeamspaceLifecycle",
        "UpdateTeamspace",
        "UpdateTeamspacePrincipal",
        "UpdateTeamspaceInviteLink",
        "AcceptTeamspaceInvite",
        "SetTeamspaceMembership",
        "UpdateTeamspaceSettings",
        "UpdateTeamspaceDefaults",
      ].map((name) => [
        name,
        {
          isPending: false,
          isSuccess: false,
          mutate(input, options) {
            calls.push([name, input]);
            options?.onSuccess?.({ token: null });
          },
        },
      ]),
    );
    const dependencies = {
      calls,
      mutations,
      workspaceId: "workspace",
      principals: [{ principalId: "existing" }],
      targets: {
        members: [
          { id: "existing", name: "Existing", email: "e@test" },
          { id: "user", name: "Person", email: "p@test" },
        ],
        teams: [{ id: "team", name: "Group" }],
      },
    };
    const input = {
      workspaceId: "workspace",
      teamspace: { id: "space", name: "Space", inviteLinkEnabled: true },
    };
    const capture = (kind, draft) => module.exports.capture(kind, input, dependencies, draft);
    const management = capture("manage", "team:team");
    assert.deepEqual(management.candidates, [
      { id: "user", label: "Person · p@test", type: "user" },
      { id: "team", label: "Group · group", type: "team" },
    ]);
    management.addCandidate();
    assert.deepEqual(calls[0], [
      "AddTeamspacePrincipal",
      {
        principalType: "team",
        role: "member",
        teamspaceId: "space",
        userId: "team",
        workspaceId: "workspace",
      },
    ]);
    management.changePrincipal({
      principalId: "principal",
      role: "owner",
      accessLevelOverride: null,
    });
    assert.deepEqual(calls[1], [
      "UpdateTeamspacePrincipal",
      {
        principalId: "principal",
        role: "owner",
        accessLevelOverride: null,
        teamspaceId: "space",
        workspaceId: "workspace",
      },
    ]);
    management.removePrincipal("principal");
    assert.deepEqual(calls[2], [
      "RemoveTeamspacePrincipal",
      { principalId: "principal", teamspaceId: "space", workspaceId: "workspace" },
    ]);
    management.selectIcon("star");
    assert.deepEqual(calls[3], [
      "UpdateTeamspace",
      { icon: "star", teamspaceId: "space", workspaceId: "workspace" },
    ]);
    calls.length = 0;
    management.toggleInviteLink();
    assert.deepEqual(calls, [
      [
        "UpdateTeamspaceInviteLink",
        { enabled: false, teamspaceId: "space", workspaceId: "workspace" },
      ],
      ["success", "Invite link disabled."],
    ]);
    let failAt = "second";
    mutations.TeamspaceLifecycle.mutateAsync = async (input) => {
      calls.push(["archive", input.teamspaceId]);
      await Promise.resolve();
      if (input.teamspaceId === failAt) throw new Error("archive denied");
    };
    calls.length = 0;
    await capture("directory", ["first", "second", "third"]).archiveSelected();
    assert.deepEqual(calls, [
      ["archive", "first"],
      ["archive", "second"],
      ["error", "archive denied"],
    ]);
    failAt = null;
    calls.length = 0;
    await capture("directory", ["first", "second"]).archiveSelected();
    assert.deepEqual(calls, [
      ["archive", "first"],
      ["archive", "second"],
      ["success", "Selected teamspaces archived."],
    ]);
    dependencies.workspaceId = null;
    calls.length = 0;
    await capture("directory", ["first"]).archiveSelected();
    assert.deepEqual(calls, []);
  });
}
