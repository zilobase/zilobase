import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { DataSession } from "../../packages/features/src/data/session";
import { useSharedEntity } from "../../packages/features/src/data/react";
import { pageCacheEntitySchema } from "../../packages/features/src/pages/cache-entities";
import { propertyCacheEntitySchema } from "../../packages/features/src/databases/schema/cache-entities";

const session = new DataSession({
  deployment: location.origin,
  workspaceId: "workspace",
  viewer: { kind: "public", capabilityId: "fixture" },
});
const pages = session.register({ name: "pages", schema: pageCacheEntitySchema });
const properties = session.register({ name: "properties", schema: propertyCacheEntitySchema });
session.ingest([
  pages.stage([
    { id: "page", name: "Original", workspaceId: "workspace", updatedAt: "2026-10-05T00:00:00Z" },
  ]),
  properties.stage([
    {
      id: "property",
      name: "Status",
      type: "select",
      workspaceId: "workspace",
      updatedAt: "2026-10-05T00:00:00Z",
    },
  ]),
]);
const renders: string[] = [];
function Consumer({ name }: { name: string }) {
  const page = useSharedEntity(pages, "page");
  const property = useSharedEntity(properties, "property");
  const text = `${page?.name}/${property?.name}`;
  renders.push(text);
  return createElement("output", { "data-testid": name }, text);
}
function App() {
  return createElement(
    "main",
    null,
    ...["sidebar", "database", "panel"].map((name) => createElement(Consumer, { name, key: name })),
    createElement(
      "button",
      {
        onClick: () =>
          session.ingest([
            pages.stage([{ id: "page", name: "Shared" }]),
            properties.stage([{ id: "property", name: "State" }]),
          ]),
      },
      "Publish",
    ),
    createElement(
      "button",
      {
        onClick: () => {
          session.ingest([pages.stage([])]);
          document.querySelector("#renders")!.textContent = JSON.stringify(renders);
        },
      },
      "Inspect",
    ),
    createElement("pre", { id: "renders" }),
  );
}
createRoot(document.getElementById("root")!).render(createElement(App));
