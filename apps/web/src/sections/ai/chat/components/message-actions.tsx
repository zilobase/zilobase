// Message pattern: https://ui.shadcn.com/docs/ai-elements/radix/message
import { useRateChatAnswer } from "@zilobase/features/ai/react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  CheckIcon,
  CopyIcon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { MessageFooter } from "@/components/ui/message";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MessageActions({
  text,
  onRetry,
  feedback: saved = null,
  messageId,
  workspaceId,
}: {
  text: string;
  onRetry?: () => void;
  feedback?: "like" | "dislike" | null;
  /** Saved answers can be rated; unsaved streaming answers keep the choice locally. */
  messageId?: string;
  workspaceId?: string | null;
}) {
  const [feedback, setLocalFeedback] = useState<"like" | "dislike" | null>(saved);
  const rate = useRateChatAnswer(workspaceId ?? "");
  const setFeedback = (rating: "like" | "dislike" | null) => {
    setLocalFeedback(rating);
    if (messageId && workspaceId && !messageId.startsWith("pending"))
      rate.mutate({ messageId, rating }, { onError: () => setLocalFeedback(feedback) });
  };
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timeout);
  }, [copyState]);
  const copy = async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copied = false;
    }
    if (mounted.current) setCopyState(copied ? "copied" : "error");
  };
  return (
    <MessageFooter className="gap-1 px-0" aria-label="Response actions">
      <TooltipProvider>
        <Action
          label={copyState === "copied" ? "Copied response" : "Copy response"}
          icon={copyState === "copied" ? CheckIcon : CopyIcon}
          onClick={copy}
        />
        <Action
          label="Like response"
          icon={ThumbsUpIcon}
          pressed={feedback === "like"}
          onClick={() => setFeedback(feedback === "like" ? null : "like")}
        />
        <Action
          label="Dislike response"
          icon={ThumbsDownIcon}
          pressed={feedback === "dislike"}
          onClick={() => setFeedback(feedback === "dislike" ? null : "dislike")}
        />
        {onRetry && <Action label="Retry response" icon={RotateCcwIcon} onClick={onRetry} />}
      </TooltipProvider>
      <span role="status" className={copyState === "error" ? "text-action-danger-text" : "sr-only"}>
        {copyState === "copied"
          ? "Response copied"
          : copyState === "error"
            ? "Could not copy response. Try again."
            : ""}
      </span>
    </MessageFooter>
  );
}

function Action({
  label,
  icon: Icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={pressed ? "selected" : "ghost"}
          size="icon-xs"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
