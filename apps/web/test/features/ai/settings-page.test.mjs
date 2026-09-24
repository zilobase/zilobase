import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("settings page keeps scope tabs, instruction permissions and version restore commands", async () => {
    const result = await build({
      stdin: {
        contents: `
      import {createElement} from "react";
      import {renderToString} from "react-dom/server";
      import {AgentSettingsPage} from "./src/features/ai/settings/components/agent-settings-page";
      import {runtime} from "settings-page-runtime";
      export function render(props,state) {Object.assign(runtime,state);return renderToString(createElement(AgentSettingsPage,props));}
    `,
        resolveDir: appPath("/"),
        sourcefile: "settings-page-test.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-settings-page",
          setup(builder) {
            builder.onResolve(
              {
                filter:
                  /^(settings-page-runtime|@tanstack\/react-router|@tanstack\/react-query|@zilobase\/features(?:\/.*)?|@\/shared\/ui\/.*|@\/features\/pages\/pane\/page-editor-pane|sonner)$|(?:^|\/)(use-settings-draft|saved-instruction-picker|settings-connectors|mcp-connections|settings-review-summary)$/,
              },
              (args) => ({ path: args.path, namespace: "settings-page" }),
            );
            builder.onLoad(
              { filter: /.*/, namespace: "settings-page" },
              ({ path }) => {
                if (path === "settings-page-runtime")
                  return { contents: "export const runtime={};", loader: "ts" };
                let code =
                  'import {runtime} from "settings-page-runtime";import {createElement} from "react";';
                if (path.startsWith("@/shared/ui/"))
                  code += [
                    "Button",
                    "Input",
                    "Select",
                    "SelectContent",
                    "SelectItem",
                    "SelectTrigger",
                    "SelectValue",
                    "Tabs",
                    "TabsList",
                    "TabsTrigger",
                  ]
                    .map(
                      (name) =>
                        `export function ${name}(props){if("${name}"==="Button")runtime.buttons.push(props);return createElement("${name}"==="Button"?"button":"div",{"data-control":"${name}",disabled:props.disabled},props.children);}`,
                    )
                    .join("");
                else if (path === "@tanstack/react-query")
                  code +=
                    "export const useQuery=()=>({data:{versions:runtime.versions||[]}});";
                else if (path === "@tanstack/react-router")
                  code +=
                    "export const useNavigate=()=>value=>runtime.calls.push(value);";
                else if (path === "@zilobase/features")
                  code +=
                    "export const useZilobaseFeatures=()=>({apiFetch(){}});";
                else if (path.endsWith("/auth/react"))
                  code +=
                    'export const useSession=()=>({data:{user:{id:"user"}}});';
                else if (path.endsWith("/workspaces/react"))
                  code += 'export const useActiveWorkspaceId=()=>"workspace";';
                else if (path.endsWith("/pages/react"))
                  code +=
                    "export const usePageNavigation=()=>({data:{pages:[],databases:[]}});export const usePageAccessTargets=()=>({data:{teams:[],members:[]}});";
                else if (path.endsWith("/ai-chat/react"))
                  code +=
                    "export const useCustomAgentRuns=()=>({data:{runs:[]}});export const useCustomAgentTriggers=()=>({data:{triggers:[]}});export const useRotateCustomAgentWebhookSecret=()=>({isPending:false,mutate(){}});";
                else if (path.endsWith("/ai-chat"))
                  code +=
                    'export const settingsDefinitionSchema={parse:value=>value};export const settingsFieldTab=()=>"instructions";';
                else if (path.endsWith("use-settings-draft"))
                  code +=
                    "export const agentSettingsVersionsQueryOptions=()=>({});export const isSettingsEditing=()=>false;export const useSettingsDraft=()=>runtime.draft;";
                else if (path.endsWith("page-editor-pane"))
                  code +=
                    'export function PageEditorPane(props){runtime.editors.push(props);return createElement("div",{"data-editor":props.pageId});}';
                else if (path.endsWith("saved-instruction-picker"))
                  code +=
                    "export function SavedInstructionPicker(){return null;}";
                else if (path.endsWith("settings-connectors"))
                  code +=
                    'export function SettingsConnectors(){return createElement("div",null,"Connector panel");}';
                else if (path.endsWith("settings-review-summary"))
                  code +=
                    "export function SettingsReviewSummary(){return null;}";
                else if (path.endsWith("mcp-connections"))
                  code +=
                    'export function PersonalMcpActivity(){return createElement("div",null,"Personal activity");}export function AgentMcpActivity(){return createElement("div",null,"Agent activity");}';
                else if (path === "sonner")
                  code +=
                    "export const toast={error:value=>runtime.calls.push(value)};";
                else throw new Error(path);
                return {
                  contents: code,
                  loader: "ts",
                  resolveDir: appPath("/"),
                };
              },
            );
            builder.onLoad({ filter: /\.css$/ }, () => ({
              contents: "",
              loader: "text",
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
    const calls = [],
      buttons = [],
      editors = [];
    const definition = {
      instructionPageId: "instruction",
      instructions: "Current",
      triggers: [],
      resources: [],
      grants: [],
      connectors: [],
    };
    const draft = {
      key: [],
      base: "/draft",
      headers: {},
      state: { canEdit: true, definition, version: 3 },
      dirty: false,
      error: null,
      syncing: false,
      reviewOpen: false,
      changedTabs: [],
      changedFields: [],
      publish: { isPending: false },
      discard: { isPending: false },
      createInstruction: {
        isPending: false,
        mutate: () => calls.push("create"),
      },
      patch: (value) => calls.push(value),
    };
    const render = (props) => {
      buttons.length = 0;
      editors.length = 0;
      return module.exports.render(
        { draft, ...props },
        {
          calls,
          buttons,
          editors,
          versions: [
            {
              id: "version",
              version: 2,
              createdAt: "2026-01-01",
              definition: { instructionPageId: "old" },
            },
          ],
        },
      );
    };
    assert.doesNotMatch(render({}), /Triggers &amp; Access/);
    assert.match(render({}), /New instruction/);
    assert.match(
      render({
        draft: {
          ...draft,
          state: {
            ...draft.state,
            definition: { ...definition, instructionPageId: null },
          },
        },
      }),
      /Create instruction/,
    );
    render({});
    assert.equal(editors[0].readOnly, false);
    assert.equal(editors[0].showCollaborationPresence, true);
    assert.match(render({ scope: "agent" }), /Triggers &amp; Access/);
    assert.match(render({ initialTab: "tools" }), /Connector panel/);
    assert.match(render({ initialTab: "activity" }), /Personal activity/);
    assert.match(
      render({
        scope: "agent",
        agent: { id: "agent" },
        initialTab: "activity",
      }),
      /Agent activity/,
    );
    render({ draft: { ...draft, state: { ...draft.state, canEdit: false } } });
    assert.equal(editors[0].readOnly, true);
    render({ initialTab: "versions" });
    buttons.find((button) => button.children === "Restore to draft").onClick();
    assert.deepEqual(calls.at(-1), { instructionPageId: "old" });
  });
}
