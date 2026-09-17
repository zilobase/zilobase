import {
  hasPendingDatabaseWrites,
  subscribeAnyPending,
} from "./pending";

export function guardPendingDatabaseWrites(target: Window): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasPendingDatabaseWrites()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  let installed = false;
  const sync = () => {
    const pending = hasPendingDatabaseWrites();
    if (pending && !installed) {
      target.addEventListener("beforeunload", onBeforeUnload);
      installed = true;
    } else if (!pending && installed) {
      target.removeEventListener("beforeunload", onBeforeUnload);
      installed = false;
    }
  };
  const unsubscribe = subscribeAnyPending(sync);
  sync();
  return () => {
    unsubscribe();
    if (installed) target.removeEventListener("beforeunload", onBeforeUnload);
    installed = false;
  };
}
