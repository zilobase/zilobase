import { build } from "esbuild";
import { createRequire } from "node:module";
import { parseHTML } from "linkedom";

export function register({ assert, appPath, test }) {
  test("dropdown defaults, inline navigation, overrides and selection persistence", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, { window, document });
    let fixture;
    try {
      const result = await build({
        stdin: {
          resolveDir: appPath("/"),
          sourcefile: "dropdown-fixture.tsx",
          loader: "tsx",
          contents: `
            import * as React from "react";
            import {createRoot} from "react-dom/client";
            import {flushSync} from "react-dom";
            import {DropdownMenu, DropdownMenuContent, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem} from "./src/shared/ui/dropdown-menu";
            export function mount(container) {
              const root = createRoot(container);
              let setOpen, setLabel;
              function Fixture() {
                const [open, updateOpen] = React.useState(true);
                const [label, updateLabel] = React.useState("Choice");
                setOpen = updateOpen; setLabel = updateLabel;
                return <DropdownMenu open={open} onOpenChange={updateOpen} defaultSubDisplayMode="inline">
                  <DropdownMenuContent>
                    <DropdownMenuSub title="Settings"><DropdownMenuSubTrigger>Settings</DropdownMenuSubTrigger><DropdownMenuSubContent>
                      <DropdownMenuItem>{label}</DropdownMenuItem>
                      <DropdownMenuCheckboxItem>Check</DropdownMenuCheckboxItem>
                      <DropdownMenuRadioItem value="radio">Radio</DropdownMenuRadioItem>
                      <DropdownMenuItem closeOnSelect>Done</DropdownMenuItem>
                      <DropdownMenuSub title="Advanced"><DropdownMenuSubTrigger>Advanced</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuItem>Deep choice</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
                      <DropdownMenuSub title="Outside" displayMode="nested"><DropdownMenuSubTrigger>Outside</DropdownMenuSubTrigger><DropdownMenuSubContent><DropdownMenuItem>Flyout choice</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuSub>
                    </DropdownMenuSubContent></DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
              flushSync(() => root.render(<Fixture/>));
              return {click(element) { flushSync(() => element.click()); }, reopen() {flushSync(() => setOpen(true));}, rename() {flushSync(() => setLabel("Updated choice"));}, unmount() {flushSync(() => root.unmount());}};
            }
          `,
        },
        bundle: true,
        write: false,
        platform: "node",
        format: "cjs",
        logLevel: "silent",
        plugins: [
          {
            name: "headless-menu-primitives",
            setup(builder) {
              builder.onResolve({ filter: /^radix-ui$/ }, () => ({
                path: "radix",
                namespace: "fixture",
              }));
              builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
                resolveDir: appPath("/"),
                loader: "tsx",
                // Test our navigation and event policy; positioning/focus internals remain Radix-owned.
                contents: `
                import * as React from "react";
                const Context = React.createContext(null);
                function Root({open, onOpenChange, children}) {return <Context.Provider value={{open,onOpenChange}}>{children}</Context.Provider>}
                function Content({children, sideOffset, collisionPadding, ...props}) {const root=React.useContext(Context); return root.open ? <div {...props}>{children}</div> : null}
                function Item({children,onSelect,asChild,...props}) {const root=React.useContext(Context); return <div {...props} onClick={() => {const event=new Event("select",{cancelable:true});onSelect?.(event);if(!event.defaultPrevented)root.onOpenChange(false)}}>{children}</div>}
                const Plain = ({children,sideOffset,collisionPadding,...props}) => <div {...props}>{children}</div>;
                export const DropdownMenu={Root, Content, Item, CheckboxItem:Item, RadioItem:Item, Portal:({children})=>children, Sub:({children})=><div data-outside="true">{children}</div>, SubTrigger:Plain, SubContent:Plain, ItemIndicator:Plain};
              `,
              }));
              builder.onResolve(
                { filter: /^@\/shared\/(components\/icons|ui\/button)$/ },
                (args) => ({ path: args.path, namespace: "controls" }),
              );
              builder.onLoad({ filter: /.*/, namespace: "controls" }, () => ({
                resolveDir: appPath("/"),
                loader: "tsx",
                contents:
                  'import * as React from "react";export const Button=props=><button {...props}/>;export const CheckIcon=()=>null;export const ChevronLeftIcon=CheckIcon;export const ChevronRightIcon=CheckIcon;export const XIcon=CheckIcon;',
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
      fixture = module.exports.mount(document.getElementById("root"));
      const visible = (selector) =>
        [...document.querySelectorAll(selector)].filter((el) => !el.closest("[hidden]"));
      const item = (text) =>
        visible(
          '[data-slot="dropdown-menu-item"],[data-slot="dropdown-menu-sub-trigger"],[data-slot="dropdown-menu-checkbox-item"],[data-slot="dropdown-menu-radio-item"]',
        ).find((el) => el.textContent === text);
      fixture.click(item("Settings"));
      assert.ok(document.querySelector('[aria-label="Back from Settings"]'));
      assert.ok(
        visible('[data-outside="true"]').length,
        "explicit nested mode must keep a separate Radix submenu",
      );
      fixture.click(item("Choice"));
      fixture.click(item("Check"));
      fixture.click(item("Radio"));
      assert.ok(item("Done"), "inline choices remain open");
      fixture.rename();
      assert.ok(item("Updated choice"), "open panels receive current parent values");
      fixture.click(item("Advanced"));
      assert.ok(item("Deep choice"));
      fixture.click(document.querySelector('[aria-label="Back from Advanced"]'));
      assert.ok(item("Updated choice"));
      fixture.click(item("Done"));
      assert.equal(document.querySelector('[data-slot="dropdown-menu-content"]'), null);
      fixture.reopen();
      assert.ok(item("Settings"));
      assert.equal(
        document.querySelector('[aria-label="Back from Settings"]'),
        null,
        "reopening resets navigation",
      );
      fixture.click(item("Settings"));
      fixture.click(item("Flyout choice"));
      assert.equal(
        document.querySelector('[data-slot="dropdown-menu-content"]'),
        null,
        "flyout actions close even inside an inline page",
      );
      fixture.reopen();
      fixture.click(item("Settings"));
      fixture.click(document.querySelector('[aria-label="Back from Settings"]'));
      assert.ok(item("Settings"));
    } finally {
      fixture?.unmount();
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}
