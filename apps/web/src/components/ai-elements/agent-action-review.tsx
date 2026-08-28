"use client";

import { useEffect, useState } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Approval = {
  actionId: string;
  expiresAt: string;
  title: string;
  toolName: string;
};

type PersistedApprovalStatus =
  | "pending"
  | "executing"
  | "rejected"
  | "succeeded"
  | "failed"
  | "expired";

type ApprovalStatus =
  | PersistedApprovalStatus
  | "loading"
  | "approving"
  | "unavailable";

export function AgentActionReviews({
  message,
  threadId,
  workspaceId,
}: {
  message: UIMessage;
  threadId: string;
  workspaceId: string;
}) {
  const approvals = message.parts.flatMap((part) => {
    if (!isToolUIPart(part)) return [];
    const approval = readApproval(part.output);
    return approval ? [approval] : [];
  });

  return approvals.map((approval) => (
    <AgentActionReview
      approval={approval}
      key={approval.actionId}
      threadId={threadId}
      workspaceId={workspaceId}
    />
  ));
}

function AgentActionReview({
  approval,
  threadId,
  workspaceId,
}: {
  approval: Approval;
  threadId: string;
  workspaceId: string;
}) {
  const [status, setStatus] = useState<ApprovalStatus>("loading");
  const expired = Date.parse(approval.expiresAt) <= Date.now();
  const statusDescription = getApprovalStatusDescription(status, expired);

  useEffect(() => {
    let active = true;
    let refreshTimer: number | undefined;
    const controller = new AbortController();

    const refreshStatus = async () => {
      try {
        const result = await apiFetch<{ status: unknown }>(
          `/api/ai/threads/${encodeURIComponent(threadId)}/actions/${encodeURIComponent(approval.actionId)}`,
          {
            headers: { "x-zilobase-workspace-id": workspaceId },
            signal: controller.signal,
          },
        );
        if (!active) return;
        const nextStatus = readPersistedApprovalStatus(result.status);
        setStatus(nextStatus ?? "unavailable");
        if (nextStatus === "executing") {
          refreshTimer = window.setTimeout(() => void refreshStatus(), 1_000);
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setStatus("unavailable");
        }
      }
    };

    void refreshStatus();
    return () => {
      active = false;
      controller.abort();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [approval.actionId, threadId, workspaceId]);

  const act = async (decision: "approve" | "reject") => {
    setStatus(decision === "approve" ? "approving" : "pending");
    try {
      await apiFetch(
        `/api/ai/threads/${encodeURIComponent(threadId)}/actions/${encodeURIComponent(approval.actionId)}/${decision}`,
        {
          headers: { "x-zilobase-workspace-id": workspaceId },
          method: "POST",
        },
      );
      setStatus(decision === "approve" ? "succeeded" : "rejected");
      if (decision === "approve") {
        toast.success(`${approval.title} completed`);
      }
    } catch (error) {
      setStatus("pending");
      toast.error(error instanceof Error ? error.message : "Could not review action.");
    }
  };

  return (
    <div className="not-prose mb-3 rounded-lg border bg-muted p-3">
      <div className="text-sm font-medium">Review: {approval.title}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {statusDescription}
      </div>
      {status === "pending" && !expired ? (
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void act("approve")} size="sm" type="button">
            Approve
          </Button>
          <Button onClick={() => void act("reject")} size="sm" type="button" variant="outline">
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function getApprovalStatusDescription(status: ApprovalStatus, expired: boolean) {
  if (status === "succeeded") return "Approved and completed.";
  if (status === "rejected") return "Rejected. No changes were made.";
  if (status === "failed") return "The approved action failed.";
  if (status === "loading") return "Checking review status…";
  if (status === "executing" || status === "approving") {
    return "Applying approved action…";
  }
  if (status === "unavailable") {
    return "Review status is unavailable. Reload and try again.";
  }
  if (status === "expired" || expired) return "This review request expired.";
  return "This changes existing workspace content or configuration.";
}

function readPersistedApprovalStatus(value: unknown): PersistedApprovalStatus | null {
  return value === "pending" ||
      value === "executing" ||
      value === "rejected" ||
      value === "succeeded" ||
      value === "failed" ||
      value === "expired"
    ? value
    : null;
}

function readApproval(output: unknown): Approval | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const envelope = output as { data?: unknown; status?: unknown };
  if (envelope.status !== "approval_required" || !envelope.data || typeof envelope.data !== "object") {
    return null;
  }
  const approval = (envelope.data as { approval?: unknown }).approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return null;
  const value = approval as Record<string, unknown>;
  return typeof value.actionId === "string" &&
      typeof value.expiresAt === "string" &&
      typeof value.title === "string" &&
      typeof value.toolName === "string"
    ? value as Approval
    : null;
}
