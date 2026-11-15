import { PageHeader } from "./page-header";
import { Link } from "@tanstack/react-router";
import { CopyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isEmbeddedMobileViewer } from "../../layout/components/page-layout";
import { toast } from "sonner";
import { formatPageBreadcrumbLabel } from "../../appearance/components/page-icon";
import { usePage } from "@zilobase/features/pages/react";

export function GuestPageTitle({ pageId }: { pageId: string }) {
  const { data: page } = usePage(pageId);
  return (
    <div className="min-w-0 flex-1 truncate text-sm font-medium">
      {page ? formatPageBreadcrumbLabel(page) : "Shared page"}
    </div>
  );
}

export function GuestPageActions() {
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Page link copied.");
  };
  return (
    <>
      <Badge variant="outline">Guest</Badge>
      <Button onClick={copyLink} size="sm" type="button" variant="outline">
        <CopyIcon />
        Copy link
      </Button>
    </>
  );
}

export function PublicPaneTopbar({ pageId }: { pageId: string | null }) {
  if (isEmbeddedMobileViewer()) return null;
  return (
    <PageHeader
      className="border-b"
      pathname={pageId ? `/p/${encodeURIComponent(pageId)}` : "/recents"}
      pageId={pageId}
      leadingControl={<PublicPageBreadcrumb pageId={pageId} />}
      showBreadcrumb={false}
      actions={<PublicLoginButton />}
    />
  );
}

export function PublicPageBreadcrumb({ pageId }: { pageId: string | null }) {
  if (!pageId) {
    return null;
  }

  return (
    <nav className="min-w-0 flex-1 text-sm" aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 text-content-secondary">
        <PublicPageBreadcrumbAncestors pageId={pageId} />
      </ol>
    </nav>
  );
}

function PublicPageBreadcrumbAncestors({ pageId }: { pageId: string }) {
  const { data: page } = usePage(pageId);
  const parentItemId = page?.parentPageId ?? null;

  return (
    <>
      {parentItemId ? (
        <>
          <PublicPageBreadcrumbAncestors pageId={parentItemId} />
          <li className="shrink-0">/</li>
        </>
      ) : null}
      <li className="min-w-0">
        <Link
          className="block max-w-48 truncate text-content-primary hover:underline sm:max-w-72"
          params={{ pageId }}
          to="/p/$pageId"
        >
          {page ? formatPageBreadcrumbLabel(page) : "Page"}
        </Link>
      </li>
    </>
  );
}

export function PublicLoginButton() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/login">Login</Link>
    </Button>
  );
}
