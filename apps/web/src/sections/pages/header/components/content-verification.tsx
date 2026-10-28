import { useEffect, useRef, useState } from "react";
import {
  useContentVerification,
  useUpdateContentVerification,
} from "@zilobase/features/pages/react";
import type { VerificationResource } from "@zilobase/features/pages";
import {
  contentVerificationSchema,
  deriveContentVerification,
  type ContentVerification,
} from "@zilobase/features/search";
import { DropDrawerItem } from "@/components/ui/dropdrawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck } from "@/components/icons";

function useLiveVerification(verification?: ContentVerification) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      setNow(Date.now());
      const remaining = verification?.expiresAt
        ? Date.parse(verification.expiresAt) - Date.now()
        : 0;
      if (remaining > 0) timer = setTimeout(refresh, Math.min(remaining + 1, 2_147_000_000));
    };
    refresh();
    return () => clearTimeout(timer);
  }, [verification?.revision, verification?.expiresAt]);
  return deriveContentVerification(
    {
      verifiedAt: verification?.verifiedAt,
      verifiedById: verification?.verifiedById,
      verificationExpiresAt: verification?.expiresAt,
      verificationUpdatedAt: verification?.revision,
    },
    now,
  );
}
const labels = { verified: "Verified", unverified: "Unverified", expired: "Expired" };

/** All verification entry points share the same scoped query and editor. */
export function ContentVerificationValue({
  resource,
  badgeOnly = false,
  editable = true,
  preview = false,
  value,
}: {
  resource: VerificationResource;
  badgeOnly?: boolean;
  editable?: boolean;
  preview?: boolean;
  value?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const projection = contentVerificationSchema.safeParse(value);
  const query = useContentVerification(resource, !projection.success || open);
  const projected = projection.success ? projection.data : undefined;
  const cached = query.data?.verification;
  const current =
    projected && (!cached || (projected.revision ?? "") >= (cached.revision ?? ""))
      ? projected
      : cached;
  const verification = useLiveVerification(current);
  const loading = !current && query.isPending;
  const unavailable = !current && query.isError;
  if (badgeOnly && (unavailable || verification.state !== "verified")) return null;
  const label = loading
    ? "Loading verification…"
    : unavailable
      ? "Verification unavailable"
      : labels[verification.state];
  const detail = verification.expiresAt
    ? `Expires ${new Date(verification.expiresAt).toLocaleString()}`
    : verification.verifiedAt
      ? "No expiry"
      : "Review and verify this page";
  return (
    <>
      <button
        type="button"
        aria-label={badgeOnly ? "Verified page" : `${label}: view verification`}
        title={`${label}. ${detail}`}
        className={
          badgeOnly
            ? "inline-flex shrink-0 items-center rounded-sm text-palette-blue focus-visible:ring-2 focus-visible:ring-action-focus-ring"
            : "database-input-cell-trigger inline-flex items-center gap-1.5 text-sm"
        }
        disabled={preview || loading}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {verification.state === "verified" ? (
          <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-palette-blue" />
        ) : null}
        {!badgeOnly ? (
          <span
            className={
              verification.state === "verified" ? "text-content-primary" : "text-content-secondary"
            }
          >
            {label}
          </span>
        ) : null}
      </button>
      {open ? (
        <ContentVerificationDialog
          resource={resource}
          open={open}
          onOpenChange={setOpen}
          editable={editable}
        />
      ) : null}
    </>
  );
}

export function ContentVerificationMetadata({
  resource,
  editable,
}: {
  resource: VerificationResource;
  editable: boolean;
}) {
  return (
    <div className="mt-4 grid min-h-8 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="flex items-center gap-2 text-content-secondary">
        <BadgeCheck className="size-4" />
        Verified
      </span>
      <ContentVerificationValue resource={resource} editable={editable} />
    </div>
  );
}
export function ContentVerificationMenuItem({
  resource,
  onOpen,
}: {
  resource: VerificationResource;
  onOpen: () => void;
}) {
  const query = useContentVerification(resource);
  const verification = useLiveVerification(query.data?.verification);
  return (
    <DropDrawerItem onSelect={onOpen}>
      <span>Verification</span>
      <span className="ml-auto text-content-secondary">
        {query.isPending ? "Loading…" : query.isError ? "Unavailable" : labels[verification.state]}
      </span>
    </DropDrawerItem>
  );
}
function localDate(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function ContentVerificationDialog({
  resource,
  open,
  onOpenChange,
  editable = true,
}: {
  editable?: boolean;
  resource: VerificationResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useContentVerification(resource, open),
    mutation = useUpdateContentVerification(resource);
  const verification = useLiveVerification(query.data?.verification);
  const [indefinite, setIndefinite] = useState(true),
    [expiry, setExpiry] = useState(""),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setIndefinite(!query.data?.verification.expiresAt);
    setExpiry(
      query.data?.verification.expiresAt ? localDate(query.data.verification.expiresAt) : "",
    );
  }, [open, resource?.id, query.data?.verification.revision]);
  const validExpiry = indefinite || Boolean(expiry && new Date(expiry).getTime() > Date.now());
  const resourceKey = resource ? `${resource.workspaceId}:${resource.type}:${resource.id}` : null;
  const currentResource = useRef(resourceKey);
  currentResource.current = resourceKey;
  const save = async (remove = false) => {
    const savingResource = resourceKey;
    setError(null);
    try {
      await mutation.mutateAsync(
        remove
          ? { remove: true }
          : { expiresAt: indefinite ? null : new Date(expiry).toISOString() },
      );
      if (currentResource.current === savingResource) onOpenChange(false);
    } catch (error) {
      if (currentResource.current === savingResource)
        setError(error instanceof Error ? error.message : "Could not update verification.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Content verification</DialogTitle>
          <DialogDescription>
            Mark this content as reviewed, until a chosen date or indefinitely.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">Loading verification…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>Could not load verification.</p>
            <Button variant="outline" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p role="status" aria-live="polite">
              Status: {labels[verification.state]}
            </p>
            {verification.verifiedAt ? (
              <p className="text-sm text-content-secondary">
                Verified {new Date(verification.verifiedAt).toLocaleString()}.{" "}
                {verification.expiresAt
                  ? `Expiry: ${new Date(verification.expiresAt).toLocaleString()}.`
                  : "No expiry."}
              </p>
            ) : null}
            {editable && query.data?.canManage ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={indefinite}
                    onChange={(event) => setIndefinite(event.target.checked)}
                    disabled={mutation.isPending}
                  />
                  Verify indefinitely
                </label>
                {!indefinite ? (
                  <label className="block space-y-2 text-sm">
                    <span>Verification expiry</span>
                    <Input
                      type="datetime-local"
                      value={expiry}
                      onChange={(event) => setExpiry(event.target.value)}
                      disabled={mutation.isPending}
                    />
                  </label>
                ) : null}
                {error ? (
                  <p role="alert" className="text-sm text-action-danger-text">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  {verification.verifiedAt ? (
                    <Button
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => void save(true)}
                    >
                      Remove verification
                    </Button>
                  ) : null}
                  <Button disabled={mutation.isPending || !validExpiry} onClick={() => void save()}>
                    {mutation.isPending
                      ? "Saving…"
                      : verification.verifiedAt
                        ? "Reverify"
                        : "Verify"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-content-secondary">Editors can manage verification.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
