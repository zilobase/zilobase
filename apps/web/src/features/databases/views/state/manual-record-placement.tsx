import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

type PlacementAction = (clearSortViewId?: string) => void | Promise<unknown>;
type ManualPlacement = {
  request: (action: PlacementAction) => void;
  pending: boolean;
  clearing: boolean;
  confirm: () => Promise<void>;
  cancel: () => void;
};
const Context = createContext<ManualPlacement | null>(null);

/** One manual-order policy for every renderer. Date-only changes bypass it. */
export function ManualRecordPlacementProvider({
  children,
  editable,
  sorted,
  viewId,
}: {
  children: ReactNode;
  editable: boolean;
  sorted: boolean;
  viewId: string | null | undefined;
}) {
  const [pending, setPending] = useState<{ run: PlacementAction } | null>(null);
  const [clearing, setClearing] = useState(false);
  const saving = useRef(false);
  const active = useRef(true);
  const editableRef = useRef(editable);
  editableRef.current = editable;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!editable) setPending(null);
  }, [editable]);
  const run = (action: PlacementAction) => {
    try {
      void Promise.resolve(action()).catch((error) =>
        toast.error(error instanceof Error ? error.message : "Couldn't move row"),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't move row");
    }
  };
  const value: ManualPlacement = {
    pending: pending !== null,
    clearing,
    request(action) {
      if (!editable || saving.current || pending) return;
      if (sorted) setPending({ run: action });
      else run(action);
    },
    cancel() {
      if (!saving.current) setPending(null);
    },
    async confirm() {
      if (!pending || saving.current || !editableRef.current) return;
      saving.current = true;
      setClearing(true);
      try {
        if (!viewId) return;
        await pending.run(viewId);
        setPending(null);
      } catch (error) {
        if (active.current)
          toast.error(error instanceof Error ? error.message : "Couldn't move row");
      } finally {
        saving.current = false;
        if (active.current) setClearing(false);
      }
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useManualRecordPlacement() {
  const value = useContext(Context);
  if (!value) throw new Error("Database row gestures require the shared placement provider");
  return value;
}
