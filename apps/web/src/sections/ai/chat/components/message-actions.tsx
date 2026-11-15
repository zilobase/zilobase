// Message pattern: https://ui.shadcn.com/docs/ai-elements/radix/message
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

export function MessageActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  // Feedback is a local selection until the service exposes a feedback command.
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);
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
