import { useCallback, useEffect, useState } from "react";
import { getMeetingCaptureRuntime } from "./capture-runtime";
import type {
  MeetingAudioDevice,
  MeetingCaptureController,
  MeetingCaptureStartConfig,
  MeetingCaptureStatus,
  MeetingTranscriptDraft,
  RecoverableMeetingCapture,
} from "./types";

export function useMeetingCapture(meetingId: string): MeetingCaptureController {
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<MeetingAudioDevice[]>([]);
  const [status, setStatus] = useState<MeetingCaptureStatus | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<MeetingTranscriptDraft[] | undefined>(
    undefined,
  );
  const [recovery, setRecovery] = useState<RecoverableMeetingCapture | null>(null);
  const runtime = getMeetingCaptureRuntime();

  useEffect(
    () =>
      runtime.observe(meetingId, {
        setLevel,
        setDevices,
        setStatus,
        setLiveTranscripts,
        setRecovery,
      }),
    [meetingId, runtime],
  );
  const start = useCallback(
    (config: MeetingCaptureStartConfig) => runtime.start(config),
    [runtime],
  );
  const prepare = useCallback(
    (config: Parameters<MeetingCaptureController["prepare"]>[0]) => runtime.prepare(config),
    [runtime],
  );
  const cancelPreparation = useCallback(() => runtime.cancelPreparation(), [runtime]);
  const pause = useCallback(() => runtime.pause(), [runtime]);
  const resume = useCallback(() => runtime.resume(), [runtime]);
  const stop = useCallback(() => runtime.stop(), [runtime]);
  const refreshTransport = useCallback(
    (audioWebsocketUrl: string, audioTicket: string) =>
      runtime.refreshTransport(audioWebsocketUrl, audioTicket),
    [runtime],
  );
  const deleteLocalFile = useCallback(
    () => runtime.deleteLocalFile(meetingId),
    [meetingId, runtime],
  );
  const openLocalFile = useCallback(() => runtime.openLocalFile(meetingId), [meetingId, runtime]);
  return {
    cancelPreparation,
    deleteLocalFile,
    devices,
    level,
    liveTranscripts,
    openLocalFile,
    pause,
    prepare,
    recovery,
    refreshTransport,
    resume,
    start,
    status,
    stop,
  };
}
