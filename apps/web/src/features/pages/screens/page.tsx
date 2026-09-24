import { useParams, useRouteContext } from "@tanstack/react-router";
import { AuthenticatedRouteError } from "@/shared/components/authenticated-route-error";
import { FallbackErrorBoundary } from "@/features/desktop/diagnostics/fallback-error-boundary";
import { PublicPage, GuestPage } from "../publication/shared-page";
import { AuthenticatedPage } from "./authenticated-page";

export default function Page() {
  const { pageId } = useParams({ from: "/p/$pageId" });
  const { publishedShare } = useRouteContext({ from: "/p/$pageId" });

  if (publishedShare === "public") {
    return <PublicPage />;
  }

  if (publishedShare === "guest") {
    return <GuestPage />;
  }

  return (
    <FallbackErrorBoundary
      fallback={<AuthenticatedRouteError resource="page" />}
      key={pageId}
      name="page.authenticated"
    >
      <AuthenticatedPage />
    </FallbackErrorBoundary>
  );
}
