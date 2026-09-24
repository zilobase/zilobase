import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("mail view settings select the matching editor and preserve unavailable panels", async () => {
    const result = await build({
      stdin: {
        contents: `import {createElement} from "react";import {renderToString} from "react-dom/server";import {MailViewSettingsMenu} from "./src/features/mail/organization/mail-view-settings-menu";export const render=props=>renderToString(createElement(MailViewSettingsMenu,props));`,
        resolveDir: appPath("/"),
        sourcefile: "mail-menu-test.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-menu-surfaces",
          setup(builder) {
            builder.onResolve({ filter: /^@\/shared\/(ui|components)\// }, (args) => ({
              path: args.path,
              namespace: "mail-menu-test",
            }));
            builder.onLoad({ filter: /.*/, namespace: "mail-menu-test" }, () => ({
              contents:
                'import {createElement} from "react";' +
                [
                  "DatabaseIcon",
                  "FilterIcon",
                  "IntersectSquareIcon",
                  "ListIcon",
                  "SlidersHorizontalIcon",
                  "Button",
                  "DropDrawer",
                  "DropDrawerContent",
                  "DropDrawerItem",
                  "DropDrawerSeparator",
                  "DropDrawerSub",
                  "DropDrawerSubContent",
                  "DropDrawerSubTrigger",
                  "DropDrawerTrigger",
                ]
                  .map(
                    (name) =>
                      `export const ${name}=props=>createElement("div",{"aria-label":props["aria-label"]},props.children);`,
                  )
                  .join(""),
              loader: "ts",
              resolveDir: appPath("/"),
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
    const render = (props) => module.exports.render(props).replace(/<!--.*?-->/g, "");
    const html = render({
      groupEditor: "Group editor",
      filterEditor: "Filter editor",
      propertiesEditor: "Properties editor",
      databaseEditor: "Database editor",
      filterCount: 2,
      filterDirty: true,
      visiblePropertyCount: 5,
    });
    for (const text of [
      "Group editor",
      "Filter editor",
      "Properties editor",
      "Database editor",
      "Unsaved filters",
      "5 properties",
    ])
      assert.ok(html.includes(text));
    assert.doesNotMatch(html, /This panel is enabled/);
    const absent = render({ groupEditor: false, filterEditor: 0 });
    assert.equal((absent.match(/This panel is enabled/g) || []).length, 4);
    assert.doesNotMatch(absent, /Unsaved filters/);
  });
}
