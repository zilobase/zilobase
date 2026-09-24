import { useCallback, useEffect, useState } from "react";
import { useCalendarWorkspace } from "@/features/calendar/workspace/calendar-workspace";

/** Visibility is independent of AI's persisted sidebar/floating preference. */
export function useCalendarChatVisibility() {
  const { panelOpen, suspendPanel } = useCalendarWorkspace();
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (panelOpen) setRequested(false);
  }, [panelOpen]);
  const setOpen = useCallback(
    (open: boolean) => {
      if (open) suspendPanel();
      setRequested(open);
    },
    [suspendPanel],
  );
  return [requested && !panelOpen, setOpen] as const;
}
