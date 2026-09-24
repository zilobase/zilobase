import React from "react";
import { renderToString } from "react-dom/server";
import { transform } from "esbuild";

export function register({ assert, readSource, test }) {
  test("application sidebar and content share the Calendar workspace provider", async () => {
    const workspaceSource = await readSource(
      "/src/features/calendar/workspace/calendar-workspace.tsx",
    );
    const workspace = await transform(
      workspaceSource.replace(/^import[\s\S]*?;\n/gm, "").replaceAll("export ", ""),
      { loader: "tsx", jsx: "transform" },
    );
    const { CalendarWorkspaceProvider, useCalendarWorkspace } = new Function(
      "React",
      ...Object.keys(React),
      `${workspace.code}; return { CalendarWorkspaceProvider, useCalendarWorkspace };`,
    )(React, ...Object.values(React));
    const source = await readSource("/src/app/shell/content/app-layout.tsx");
    // Execute the real shell composition, replacing unrelated services and surfaces.
    const shell = source.slice(
      source.indexOf("export function AppLayout("),
      source.indexOf("function AppLayoutContent("),
    );
    const { code } = await transform(
      shell.replace("export function AppLayout", "function AppLayout"),
      { loader: "tsx", jsx: "transform" },
    );
    const contexts = [];
    const passthrough = ({ children }) => children;
    const consumer = () => {
      contexts.push(useCalendarWorkspace());
      return null;
    };
    const dependencies = {
      React,
      ...React,
      SidebarProvider: passthrough,
      AppSearchProvider: passthrough,
      PageLayoutSidebarProvider: passthrough,
      LayoutEditorProvider: passthrough,
      AppSidebar: consumer,
      AppLayoutContent: consumer,
      CalendarWorkspaceProvider,
      APP_SIDEBAR_PANEL_WIDTH: 256,
      useRouterState: () => "/calendar",
      useNavigate: () => () => {},
      useRoutePageId: () => null,
      getSettingsSection: () => "preferences",
    };
    const AppLayout = new Function(...Object.keys(dependencies), `${code}; return AppLayout;`)(
      ...Object.values(dependencies),
    );
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => ({ className: "" }) };
    try {
      assert.doesNotThrow(
        () => renderToString(React.createElement(AppLayout)),
        "Calendar sidebar must be inside its workspace provider",
      );
      assert.equal(contexts.length, 2);
      assert.equal(
        contexts[0],
        contexts[1],
        "Sidebar and dock must share one controller, not separate providers",
      );
    } finally {
      globalThis.document = previousDocument;
    }
  });
}
