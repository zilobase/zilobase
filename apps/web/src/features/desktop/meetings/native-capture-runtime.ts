import { desktopBridge } from "@/platform/desktop/native";
import type { ZilobaseDesktopBridge } from "../../../../../desktop/electron/shared/bridge";
import type { MeetingCaptureRuntime } from "@/features/meetings/capture/capture-runtime";

export function createNativeMeetingCaptureRuntime(
  capture: ZilobaseDesktopBridge["capture"] = desktopBridge().capture,
): MeetingCaptureRuntime {
  return {
    observe(
      meetingId,
      { setLevel, setDevices, setStatus, setLiveTranscripts, setRecovery },
    ) {
      let cancelled = false;
      const unlisteners: Array<() => void> = [];
      void capture.state().then((value) => {
        if (!cancelled && value.meetingId === meetingId) setStatus(value);
      });
      void capture.listDevices().then((value) => {
        if (!cancelled) setDevices(value);
      }).catch(() => undefined);
      const loadRecovery = () => capture.recoverable().then((sessions) => {
        if (!cancelled) {
          setRecovery(sessions.find((session) => session.meetingId === meetingId) ?? null);
        }
      });
      void loadRecovery();
      unlisteners.push(capture.onState((payload) => {
        if (payload.meetingId === meetingId) {
          setStatus(payload);
          if (payload.phase === "stopped") {
            setLiveTranscripts([]);
            void loadRecovery();
          }
        }
      }));
      unlisteners.push(capture.onLevel((payload) => {
        setLevel(Math.min(1, Math.max(payload.rms * 4, payload.peak)));
      }));
      unlisteners.push(capture.onWarning((payload) => {
        if (!payload.message) return;
        setStatus((current) =>
          current?.meetingId === meetingId
            ? {
                ...current,
                warnings: current.warnings?.includes(payload.message)
                  ? current.warnings
                  : [...(current.warnings ?? []), payload.message],
              }
            : current,
        );
      }));
      unlisteners.push(capture.onTranscript((payload) => {
        if (payload === null) {
          setLiveTranscripts([]);
          return;
        }
        if (payload.meetingId !== meetingId) return;
        setLiveTranscripts((current) => {
          const next = (current ?? []).filter((draft) => draft.source !== payload.source);
          if (payload.text) next.push(payload);
          return next;
        });
      }));

      return () => {
        cancelled = true;
        unlisteners.forEach((unlisten) => unlisten());
      };
    },
    start: (config) => capture.start(config),
    prepare: () => Promise.resolve(),
    cancelPreparation: () => Promise.resolve(),
    pause: () => capture.pause(),
    resume: () => capture.resume(),
    stop: () => capture.stop(),
    refreshTransport: (audioWebsocketUrl, audioTicket) =>
      capture.refreshTransport(audioWebsocketUrl, audioTicket),
    deleteLocalFile: (meetingId) => capture.deleteLocal(meetingId),
    openLocalFile: (meetingId) => capture.openLocal(meetingId),
  };
}
