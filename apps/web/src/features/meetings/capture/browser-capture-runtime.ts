import type { BrowserMeetingCapture } from "./browser-meeting-capture";
import type { MeetingCaptureRuntime } from "./capture-runtime";

export function createBrowserMeetingCaptureRuntime(
  browserCapture: BrowserMeetingCapture,
): MeetingCaptureRuntime {
  return {
    observe(meetingId, { setLevel, setDevices, setStatus, setLiveTranscripts, setRecovery }) {
      let cancelled = false;
      const unlisteners: Array<() => void> = [];
      const sync = () => {
        if (cancelled) return;
        setLevel(browserCapture.level);
        setLiveTranscripts(
          browserCapture.liveTranscripts?.filter((draft) => draft.meetingId === meetingId),
        );
        setStatus(browserCapture.status?.meetingId === meetingId ? browserCapture.status : null);
        setRecovery(
          browserCapture.recovery?.meetingId === meetingId ? browserCapture.recovery : null,
        );
      };
      unlisteners.push(browserCapture.subscribe(sync));
      void browserCapture.listDevices().then((value) => {
        if (!cancelled) setDevices(value);
      });
      void browserCapture.loadRecovery(meetingId);
      sync();
      return () => {
        cancelled = true;
        unlisteners.forEach((unlisten) => unlisten());
      };
    },
    start: (config) => browserCapture.start(config),
    prepare: (config) => browserCapture.prepare(config),
    cancelPreparation: () => browserCapture.cancelPreparation(),
    pause: () => browserCapture.pause(),
    resume: () => browserCapture.resume(),
    stop: () => browserCapture.stop(),
    refreshTransport: (url, ticket) => browserCapture.refreshTransport(url, ticket),
    deleteLocalFile: (id) => browserCapture.deleteLocalFile(id),
    openLocalFile: (id) => browserCapture.openLocalFile(id),
  };
}
