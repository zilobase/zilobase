import { invoke as nativeInvoke } from "@/platform/desktop/native";
import { listen as nativeListen } from "@/platform/desktop/native";
import type { MeetingCaptureRuntime } from "@/features/meetings/capture/capture-runtime";
import type {
  MeetingCaptureStatus,
  MeetingAudioDevice,
  MeetingTranscriptDraft,
  RecoverableMeetingCapture,
} from "@/features/meetings/capture";

export function createNativeMeetingCaptureRuntime(
  { invoke, listen } = { invoke: nativeInvoke, listen: nativeListen },
): MeetingCaptureRuntime {
  return {
    observe(
      meetingId,
      { setLevel, setDevices, setStatus, setLiveTranscripts, setRecovery },
    ) {
      let cancelled = false;
      const unlisteners: Array<() => void> = [];
      void invoke<MeetingCaptureStatus>("meeting_capture_state").then(
        (value) => {
          if (!cancelled && value.meetingId === meetingId) setStatus(value);
        },
      );
      void invoke<MeetingAudioDevice[]>("meeting_capture_list_devices")
        .then((value) => {
          if (!cancelled) setDevices(value);
        })
        .catch(() => undefined);
      const loadRecovery = () =>
        invoke<RecoverableMeetingCapture[]>(
          "meeting_capture_recoverable_sessions",
        ).then((sessions) => {
          if (!cancelled) {
            setRecovery(
              sessions.find((session) => session.meetingId === meetingId) ??
                null,
            );
          }
        });
      void loadRecovery();
      void listen<MeetingCaptureStatus>(
        "meeting-capture-state",
        ({ payload }) => {
          if (payload.meetingId === meetingId) {
            setStatus(payload);
            if (payload.phase === "stopped") setLiveTranscripts([]);
            if (payload.phase === "stopped") void loadRecovery();
          }
        },
      ).then((unlisten) => {
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      });
      void listen<{ peak: number; rms: number }>(
        "meeting-capture-level",
        ({ payload }) => {
          setLevel(Math.min(1, Math.max(payload.rms * 4, payload.peak)));
        },
      ).then((unlisten) => {
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      });
      void listen<{ message?: string }>(
        "meeting-capture-warning",
        ({ payload }) => {
          if (!payload.message) return;
          setStatus((current) =>
            current?.meetingId === meetingId
              ? {
                  ...current,
                  warnings: current.warnings?.includes(payload.message!)
                    ? current.warnings
                    : [...(current.warnings ?? []), payload.message!],
                }
              : current,
          );
        },
      ).then((unlisten) => {
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      });
      void listen<MeetingTranscriptDraft | null>(
        "meeting-capture-transcript",
        ({ payload }) => {
          if (payload === null) {
            setLiveTranscripts([]);
            return;
          }
          if (payload.meetingId !== meetingId) return;
          setLiveTranscripts((current) => {
            const next = (current ?? []).filter(
              (draft) => draft.source !== payload.source,
            );
            if (payload.text) next.push(payload);
            return next;
          });
        },
      ).then((unlisten) => {
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      });

      return () => {
        cancelled = true;
        unlisteners.forEach((unlisten) => unlisten());
      };
    },
    start: (config) => invoke("meeting_capture_start", { config }),
    prepare: () => Promise.resolve(),
    cancelPreparation: () => Promise.resolve(),
    pause: () => invoke("meeting_capture_pause"),
    resume: () => invoke("meeting_capture_resume"),
    stop: () => invoke("meeting_capture_stop"),
    refreshTransport: (audioWebsocketUrl, audioTicket) =>
      invoke("meeting_capture_refresh_transport", {
        audioTicket,
        audioWebsocketUrl,
      }),
    deleteLocalFile: (meetingId) =>
      invoke("meeting_capture_delete_local_file", { meetingId }),
    openLocalFile: (meetingId) =>
      invoke("meeting_capture_open_local_file", { meetingId }),
  };
}
