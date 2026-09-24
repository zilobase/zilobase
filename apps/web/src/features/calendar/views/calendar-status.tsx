import { getApiErrorMessage } from "@/platform/network/api";
type StatusSnapshot = { syncing: boolean; loaded: boolean; stale: boolean; error?: unknown };
export function CalendarStatus({
  data,
  online,
  error,
}: {
  data: StatusSnapshot[];
  online: boolean;
  error: unknown;
}) {
  const failure = error ?? data.find((snapshot) => snapshot.error)?.error;
  return (
    <>
      {!online && (
        <p role="status" className="shrink-0 px-3 py-1 text-xs text-content-secondary">
          Offline · cached events only
          {data.some((snapshot) => !snapshot.loaded) && " · Some dates are not cached"}
        </p>
      )}
      {failure ? (
        <p role="alert" className="px-3 text-sm text-feedback-error-text">
          {getApiErrorMessage(failure)}
        </p>
      ) : null}
    </>
  );
}
