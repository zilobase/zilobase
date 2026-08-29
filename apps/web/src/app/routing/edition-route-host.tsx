import { useRouterState } from "@tanstack/react-router";
import { editionWebModule } from "@zilobase/edition-web";

export function EditionRouteHost() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const route = editionWebModule.routes.find(
    (candidate) =>
      `/enterprise/${candidate.path.replace(/^\/+/, "")}` === pathname,
  );

  if (!route) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">
          Enterprise page not found.
        </p>
      </main>
    );
  }

  const EditionComponent = route.component;
  return <EditionComponent />;
}
