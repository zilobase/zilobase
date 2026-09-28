import type { DatabaseCommandState } from "./pending";

export function guardPendingDatabaseWrites(
  target: Window,
  state: DatabaseCommandState,
): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!state.hasPending()) return;
    event.preventDefault();
    event.returnValue = "";
  };
  let installed = false;
  const sync = () => {
    const pending = state.hasPending();
    if (pending && !installed) {
      target.addEventListener("beforeunload", onBeforeUnload);
      installed = true;
    } else if (!pending && installed) {
      target.removeEventListener("beforeunload", onBeforeUnload);
      installed = false;
    }
  };
  const unsubscribe = state.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    if (installed) target.removeEventListener("beforeunload", onBeforeUnload);
    installed = false;
  };
}
