# Meeting capture and recovery

## Capture interface and runtime selection

[Application composition](../../../apps/web/src/app/runtime/configure-meeting-capture.ts) installs a browser or native [capture runtime](../../../apps/web/src/features/meetings/capture/capture-runtime.ts) before rendering. The [capture hook](../../../apps/web/src/features/meetings/capture/use-meeting-capture.ts) owns React state and delegates commands and observation to this runtime. Editor meeting rendering consumes the meeting capture entrypoint without selecting a desktop implementation.

The [browser adapter](../../../apps/web/src/features/meetings/capture/browser-capture-runtime.ts) observes a single application-owned BrowserMeetingCapture instance. The [native adapter](../../../apps/web/src/features/desktop/meetings/native-capture-runtime.ts) loads native state, devices and recovery sessions and subscribes to capture state, levels, warnings and transcript events. Observation filters meeting-specific state and transcript drafts, replaces drafts by audio source, and releases listeners when the consumer changes meetings or unmounts. Registrations resolving after disposal are immediately released. Stopping observation does not stop the recording.

Native invocation and event listening form a production/test seam. Command names, argument objects, device handling and recovery file operations remain the existing Tauri contract. Browser prepare/cancel preparation manage device acquisition; their native equivalents remain no-ops.

## Browser audio and recovery

[BrowserMeetingCapture](../../../apps/web/src/features/meetings/capture/browser-meeting-capture.ts) owns preparation, recording state, device resources, pause/resume/stop and local recovery artifacts. [Audio processing](../../../apps/web/src/features/meetings/capture/browser-audio-processing.ts) owns resampling, mixing, sample queues and PCM conversion. [BrowserMeetingTransport](../../../apps/web/src/features/meetings/capture/browser-meeting-transport.ts) owns audio framing, bounded queues, acknowledgements, reconnect attempts and transcript event parsing. The original capture module retains its existing exported transport and audio utilities for compatibility. Tests now load the audio and transport owners directly. Sample queues remain private to their single capture consumer.

Transport reconnect and recording recovery have different lifetimes: a dropped socket can retry with queued frames while capture continues; an interrupted capture retains its meeting/session association and local artifacts. Native [capture](../../../apps/desktop/src-tauri/src/meetings/capture.rs), [transport](../../../apps/desktop/src-tauri/src/meetings/capture/transport.rs), [audio](../../../apps/desktop/src-tauri/src/meetings/audio.rs) and [recovery](../../../apps/desktop/src-tauri/src/meetings/recovery.rs) retain their existing ownership and serialized formats.

## Server session and transcript ownership

The existing [meeting operations interface](../../../apps/server/src/features/meetings/lifecycle/meeting-service.ts) explicitly exports the following owners:

- [Access loading](../../../apps/server/src/features/meetings/lifecycle/meeting-access.ts) resolves meeting/page/workspace authority; [meeting operations](../../../apps/server/src/features/meetings/lifecycle/meeting-operations.ts) own creation, metadata, deletion and listing.
- [Recorder sessions](../../../apps/server/src/features/meetings/lifecycle/recorder-session.ts) own consent, claim, heartbeat, release and lease validation. [Transitions](../../../apps/server/src/features/meetings/lifecycle/meeting-transitions.ts) own lifecycle commands; both translate known runtime lease/status conflicts through the shared [runtime mutation helper](../../../apps/server/src/features/meetings/lifecycle/recorder-runtime.ts).
- [Transcript persistence](../../../apps/server/src/features/meetings/transcription/transcript-persistence.ts) owns duplicate provider-segment handling and transactionally storing session segments, Yjs state and optional finalization. Completed meetings are protected from finalization status regression.

Recording ownership, status, consent and captured audio remain separate facts. Claims require access and recent consent. Heartbeat/release require the active lease; stale leases are rejected. An expired paused recording is archived for processing before another claim. [Audio tickets](../../../apps/server/src/features/meetings/audio/meeting-audio-ticket.ts) and [realtime transcription](../../../apps/server/src/features/meetings/transcription/meeting-realtime-transcription.ts) connect transport to these persistence operations. Transcript and summary content are applied through collaboration rather than an independent editor document.

The capture zone permits dependencies only within capture. The editor’s former permission to import desktop implementations is replaced with this smaller capture capability; desktop imports likewise target capture instead of the whole meetings feature. App composition selects the native adapter through its desktop meeting entrypoint. The unused internal desktop capture-hook shim is removed.

## Verification

[Session tests](../../../apps/server/src/features/meetings/lifecycle/meeting-session.test.ts) exercise consent, stale claims, lost leases, runtime conflicts, duplicate transcript segments and transactional rollback with controlled database/runtime adapters. [Capture runtime tests](../../../apps/web/test/features/meetings/capture-runtime.test.mjs) exercise native event filtering, command arguments, late subscription cleanup and browser observation disposal. Existing browser capture/transport, state, transcription and native tests cover their owning interfaces.

These controlled checks do not establish real PostgreSQL claim contention, mounted React effect timing, live transcription-provider behavior or physical-device recovery. Browser/native smoke verification complements them. [Meeting block guide](../../../docs/meetings/meeting-block.md) remains the editor-facing operational guide.

[Meetings overview](README.md).
