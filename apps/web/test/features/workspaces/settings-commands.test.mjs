import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("workspace settings validate and save drafts", async () => {
    const result = await build({
      stdin: {
        contents: `
      import {createElement} from "react";
      import {renderToString} from "react-dom/server";
      import {useWorkspaceDetails} from "./src/features/workspaces/settings/workspace-details-state";
      import {runtime} from "settings-test-runtime";
      export function capture(input,dependencies,draft) {
        Object.assign(runtime,dependencies);
        let controls,seeded=false,submitted=false;
        function Probe() {
          controls=useWorkspaceDetails(input);
          if(draft && !seeded) {
            seeded=true;
            controls.setName(draft.name); controls.setSlug(draft.slug);
            controls.setLogo(draft.logo); controls.setMetadata(draft.metadata);
          } else if(draft && !submitted) {
            submitted=true; controls.saveWorkspace({preventDefault(){}});
          }
          return null;
        }
        renderToString(createElement(Probe)); return controls;
      }
    `,
        resolveDir: appPath("/"),
        sourcefile: "settings-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-settings",
          setup(build) {
            const sources = {
              "settings-test-runtime": "export const runtime={};",
              sonner:
                'export const toast=Object.fromEntries(["success","error","info"].map(kind=>[kind,value=>runtime.calls.push([kind,value])]));',
              "@zilobase/features/workspaces/react":
                "export const useUpdateWorkspace=()=>runtime.update;",
              "@/platform/network/api": "export const getApiErrorMessage=error=>error.message;",
            };
            build.onResolve({ filter: /.*/ }, (args) =>
              Object.hasOwn(sources, args.path)
                ? { path: args.path, namespace: "settings-test" }
                : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: "settings-test" }, ({ path }) => ({
              contents:
                (path === "settings-test-runtime"
                  ? ""
                  : 'import {runtime} from "settings-test-runtime";') + sources[path],
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
    const dependencies = {
      calls,
      update: {
        isPending: false,
        mutate(input, options) {
          calls.push(["update", input]);
          options.onSuccess();
        },
      },
    };
    const capture = (input, draft) => module.exports.capture(input, dependencies, draft);
    const workspace = { id: "workspace", name: "Name", slug: "name", logo: null, metadata: null };
    const draft = { name: " New name ", slug: " NEW-NAME ", logo: "", metadata: " notes " };
    assert.equal(capture({ workspace }).hasChanges, false);
    assert.equal(
      capture({ workspace }, { ...draft, name: " " }).error,
      "Workspace name is required.",
    );
    assert.equal(
      capture({ workspace }, { ...draft, slug: "bad_slug" }).error,
      "Use lowercase letters, numbers, and hyphens for the slug.",
    );
    assert.equal(
      capture({ workspace }, { ...draft, logo: "bad-url" }).error,
      "Enter a valid logo URL.",
    );
    assert.deepEqual(calls, []);
    capture({ workspace }, draft);
    assert.deepEqual(calls[0], [
      "update",
      {
        workspaceId: "workspace",
        name: "New name",
        slug: "new-name",
        logo: null,
        metadata: "notes",
      },
    ]);
    assert.equal(
      capture({ workspace: null }, draft).error,
      "Select an workspace before updating settings.",
    );
  });
}
