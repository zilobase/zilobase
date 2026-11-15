import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export const appShortcutDefinitions = {
  calendarTravel: { key: "z", primaryModifier: false, shiftKey: false },
  calendarHelp: { key: "?", primaryModifier: false, shiftKey: null },
  calendarToday: { key: "t", primaryModifier: false, shiftKey: false },
  calendarPrevious: { key: "arrowleft", primaryModifier: false, shiftKey: false },
  calendarNext: { key: "arrowright", primaryModifier: false, shiftKey: false },
  calendarCreate: { key: "c", primaryModifier: false, shiftKey: false },
  calendarNextEvent: { key: "j", primaryModifier: false, shiftKey: false },
  calendarPreviousEvent: { key: "k", primaryModifier: false, shiftKey: false },
  openSearch: {
    key: "k",
    primaryModifier: true,
    shiftKey: false,
  },
  redo: {
    key: "z",
    primaryModifier: true,
    shiftKey: true,
  },
  undo: {
    key: "z",
    primaryModifier: true,
    shiftKey: false,
  },
} as const;

export type AppShortcutId = keyof typeof appShortcutDefinitions;

type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

type ShortcutPointerEvent = Pick<
  MouseEvent,
  "altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
>;

export function isOpenInNewTabShortcut(event: ShortcutPointerEvent) {
  return event.button === 0 && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;
}

export function matchesAppShortcut(event: ShortcutKeyboardEvent, shortcutId: AppShortcutId) {
  if (typeof event.key !== "string") return false;
  const shortcut = appShortcutDefinitions[shortcutId];
  const hasPrimaryModifier = event.metaKey || event.ctrlKey;

  return (
    event.key.toLowerCase() === shortcut.key &&
    (shortcut.primaryModifier ? hasPrimaryModifier : !hasPrimaryModifier) &&
    !event.altKey &&
    (shortcut.shiftKey === null || event.shiftKey === shortcut.shiftKey)
  );
}

type ShortcutRegistration = {
  allowInEditable: boolean;
  handler: (event: KeyboardEvent) => boolean;
  order: number;
  priority: number;
  shortcutId: AppShortcutId;
};

type ShortcutContextValue = {
  register: (registration: Omit<ShortcutRegistration, "order">) => () => void;
};

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function isEditableShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select, [role='textbox']"))
  );
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef(new Map<symbol, ShortcutRegistration>());
  const registrationOrderRef = useRef(0);
  const register = useCallback((registration: Omit<ShortcutRegistration, "order">) => {
    const registrationKey = Symbol(registration.shortcutId);

    registrationOrderRef.current += 1;
    registrationsRef.current.set(registrationKey, {
      ...registration,
      order: registrationOrderRef.current,
    });

    return () => registrationsRef.current.delete(registrationKey);
  }, []);
  const contextValue = useMemo(() => ({ register }), [register]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const registrations = [...registrationsRef.current.values()].sort(
        (left, right) => right.priority - left.priority || right.order - left.order,
      );

      for (const registration of registrations) {
        if (
          !matchesAppShortcut(event, registration.shortcutId) ||
          (!registration.allowInEditable && isEditableShortcutTarget(event.target))
        ) {
          continue;
        }

        if (!registration.handler(event)) {
          continue;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return <ShortcutContext.Provider value={contextValue}>{children}</ShortcutContext.Provider>;
}

export function useAppShortcut(
  shortcutId: AppShortcutId,
  handler: (event: KeyboardEvent) => boolean,
  options: {
    allowInEditable?: boolean;
    priority?: number;
  } = {},
) {
  const context = useContext(ShortcutContext);
  const handlerRef = useRef(handler);

  if (!context) {
    throw new Error("useAppShortcut must be used inside ShortcutProvider");
  }

  handlerRef.current = handler;

  useEffect(
    () =>
      context.register({
        allowInEditable: options.allowInEditable ?? false,
        handler: (event) => handlerRef.current(event),
        priority: options.priority ?? 0,
        shortcutId,
      }),
    [context, options.allowInEditable, options.priority, shortcutId],
  );
}
