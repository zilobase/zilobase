import { useRouter, useRouterState } from "@tanstack/react-router";

import { LockIcon, SlidersHorizontalIcon } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";

export function CustomAgentHeaderActions({ agentId }: { agentId: string }) {
  const router = useRouter();
  const { hash, pathname, searchStr } = useRouterState({
    select: (state) => ({
      hash: state.location.hash,
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
  });
  const search = new URLSearchParams(searchStr);
  const settingsOpen = search.get("panel") === "settings";

  const toggleSettings = () => {
    const next = new URLSearchParams(searchStr);
    if (settingsOpen) {
      next.delete("panel");
      next.delete("settingsTab");
    } else {
      next.set("panel", "settings");
      next.set("settingsTab", next.get("settingsTab") ?? "overview");
    }
    const query = next.toString();
    router.history.replace(`${pathname}${query ? `?${query}` : ""}${hash}`);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label={settingsOpen ? "Close Custom Agent settings" : "Open Custom Agent settings"}
        aria-pressed={settingsOpen}
        className={settingsOpen ? "bg-action-neutral-pressed text-action-on-neutral" : undefined}
        onClick={toggleSettings}
        size="icon"
        title={settingsOpen ? "Close settings" : "Settings"}
        type="button"
        variant="ghost"
      >
        <SlidersHorizontalIcon />
      </Button>
      <CustomAgentShareHeaderAction agentId={agentId} />
    </div>
  );
}

export function CustomAgentShareHeaderAction({ agentId }: { agentId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-2"
      aria-haspopup="dialog"
      onClick={(event) =>
        window.dispatchEvent(
          new CustomEvent("agent-share", {
            detail: { agentId, anchor: event.currentTarget },
          }),
        )
      }
    >
      <LockIcon />
      Share
    </Button>
  );
}
