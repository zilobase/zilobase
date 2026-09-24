import type { CalendarDestination } from "./calendar-navigation";
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
  type ReactNode,
} from "react";

export type CalendarCommand = {
  id: string;
  label: string;
  run: () => void;
  disabled?: boolean;
  shortcut?: string;
};
type PanelActions = { close: () => void; create: () => void };
function useWorkspaceState() {
  const [panelElement] = useState(() => {
    const element = document.createElement("div");
    element.className = "h-full min-h-0";
    return element;
  });
  const [featureCommands, setFeatureCommands] = useState<CalendarCommand[]>([]);
  const [travelPickerOpen, setTravelPickerOpen] = useState(false);
  const [travelZone, setTravelZone] = useState<string | null>(null);
  const [source, setSource] = useState<{ bindingId: string; calendarId: string } | null>(null);
  const [query, setQuery] = useState("");
  const [visibleDate, setVisibleDate] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const navigation = useRef<
    ((destination: CalendarDestination, commit: () => void) => void) | null
  >(null);
  const registerNavigation = useCallback(
    (handler: (destination: CalendarDestination, commit: () => void) => void) => {
      navigation.current = handler;
      return () => {
        if (navigation.current === handler) navigation.current = null;
      };
    },
    [],
  );
  const navigateCalendar = useCallback((destination: CalendarDestination, commit: () => void) => {
    if (navigation.current) navigation.current(destination, commit);
    else commit();
  }, []);
  const actions = useRef<PanelActions | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const openPanel = useCallback(() => {
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      !document.activeElement.closest("[data-calendar-event-panel]")
    )
      trigger.current = document.activeElement;
    setPanelOpen(true);
  }, []);
  const showSource = useCallback(
    (value: { bindingId: string; calendarId: string } | null) => {
      setSource(value);
      if (value) openPanel();
    },
    [openPanel],
  );
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSource(null);
    actions.current?.close();
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else document.querySelector<HTMLButtonElement>("[data-calendar-panel-toggle]")?.focus();
    });
  }, []);
  const suspendPanel = useCallback(() => setPanelOpen(false), []);
  const register = useCallback((value: PanelActions) => {
    actions.current = value;
    return () => {
      actions.current = null;
    };
  }, []);
  const reset = useCallback(() => {
    setFeatureCommands([]);
    setTravelZone(null);
    setTravelPickerOpen(false);
    setPanelOpen(false);
    setSource(null);
    setQuery("");
    setVisibleDate(null);
    actions.current = null;
    trigger.current = null;
  }, []);
  const create = useCallback(() => actions.current?.create(), []);
  return useMemo(
    () => ({
      navigateCalendar,
      registerNavigation,
      travelPickerOpen,
      setTravelPickerOpen,
      featureCommands,
      setFeatureCommands,
      travelZone,
      setTravelZone,
      source,
      showSource,
      panelElement,
      query,
      setQuery,
      visibleDate,
      setVisibleDate,
      panelOpen,
      openPanel,
      closePanel,
      suspendPanel,
      register,
      reset,
      create,
    }),
    [
      travelPickerOpen,
      featureCommands,
      travelZone,
      source,
      showSource,
      panelElement,
      query,
      visibleDate,
      panelOpen,
      openPanel,
      closePanel,
      suspendPanel,
      register,
      reset,
      create,
    ],
  );
}
const CalendarWorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function CalendarWorkspaceProvider({ children }: { children: ReactNode }) {
  return (
    <CalendarWorkspaceContext.Provider value={useWorkspaceState()}>
      {children}
    </CalendarWorkspaceContext.Provider>
  );
}
export function useCalendarWorkspace() {
  const value = useContext(CalendarWorkspaceContext);
  if (!value) throw new Error("Calendar requires its workspace provider");
  return value;
}

/** Reparent a stable portal target so drafts survive dock switches and breakpoints. */
export function CalendarDockMount() {
  const { panelElement } = useCalendarWorkspace();
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const parent = host.current!;
    parent.appendChild(panelElement);
    return () => {
      if (panelElement.parentNode === parent) parent.removeChild(panelElement);
    };
  }, [panelElement]);
  return <div ref={host} className="h-full min-h-0" />;
}
