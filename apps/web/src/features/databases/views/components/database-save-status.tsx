import { useSyncExternalStore } from "react";
import { useDatabaseEntityCommandState } from "@zilobase/features/databases/react";

function subscribeConnectivity(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function DatabaseSaveStatus({ databaseId }: { databaseId: string }) {
  const state = useDatabaseEntityCommandState({ hostDatabaseId: databaseId });
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const message = !online
    ? "Offline — reconnect to save"
    : state.error?.name === "DatabaseReconciliationError"
      ? "Saved — reload to refresh"
    : state.error?.name === "DatabaseCommandUnconfirmedError"
      ? "Save unconfirmed — reload to check"
    : state.error
      ? `Save failed${state.isPending ? " · Saving other changes…" : " — try your edit again"}`
      : state.isPending
        ? "Saving…"
        : null;
  if (!message) return null;

  return (
    <span
      className="mx-2 max-w-64 truncate text-xs text-content-secondary"
      role={state.error ? "alert" : "status"}
      title={state.error?.message ?? message}
    >
      {message}
    </span>
  );
}
