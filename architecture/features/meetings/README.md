# Meetings

## Owning modules and interface

- [apps/server/src/features/meetings](../../../apps/server/src/features/meetings)
- [apps/web/src/features/meetings](../../../apps/web/src/features/meetings)
- [apps/desktop/electron/sidecar/src/meetings](../../../apps/desktop/electron/sidecar/src/meetings)
- [packages/features/src/meetings](../../../packages/features/src/meetings)

## Main flow

Meeting operations create page-linked meetings, transition status, claim recording sessions and accept transcripts. Request bodies are parsed and validated using Effect `Schema` runtime parsing (`parseJsonBody`). Browser/native capture adapters transport audio; realtime transcription and summary modules update collaborative content.

## Authorization and persistence

Meetings, consent events, transcript segments and collaboration documents are stored separately. Access follows page/workspace authority. Recorder leases restrict which session can append audio/transcripts.

## Side effects, failures and recovery

Capture devices, transcription sockets and summary generation fail independently. Preserve heartbeat/release ordering, pause/resume/stop transitions, segment identity, and recovery after capture interruption.

## Focused guides

- [Meeting capture and recovery](capture-and-recovery.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/meetings/lifecycle/meeting-state.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Capability map

Server [lifecycle](../../../apps/server/src/features/meetings/lifecycle) owns access loading, meeting operations, recorder claims and pure status transitions. [Contracts](../../../apps/server/src/features/meetings/contracts) define server type views over the shared meeting representation. [Audio](../../../apps/server/src/features/meetings/audio) signs/verifies transport tickets, [transcription](../../../apps/server/src/features/meetings/transcription) owns realtime provider sessions, and [summary](../../../apps/server/src/features/meetings/summary) owns summary generation and collaborative application. HTTP composition remains at the existing `routes.ts` / `meeting-routes.ts` entrypoints.

The [web screen](../../../apps/web/src/features/meetings/screens/meeting.tsx) composes the meeting's page and controls. [Editor meeting rendering](../../../apps/web/src/features/editor/extensions/meeting/meeting-view.tsx) connects document/UI interactions with meeting commands. [Capture contracts and browser implementation](../../../apps/web/src/features/meetings/capture) remain independent of meeting routes; [application composition](../../../apps/web/src/app/runtime/configure-meeting-capture.ts) selects browser versus native capture before rendering. The shared capture hook observes that runtime; the desktop adapter owns native event subscriptions.

The native sidecar has distinct owners: [audio](../../../apps/desktop/electron/sidecar/src/meetings/audio.rs) handles signal processing, [capture](../../../apps/desktop/electron/sidecar/src/meetings/capture.rs) owns recording, its [devices](../../../apps/desktop/electron/sidecar/src/meetings/capture/devices.rs) and [transport](../../../apps/desktop/electron/sidecar/src/meetings/capture/transport.rs) implement capture mechanisms, and [recovery](../../../apps/desktop/electron/sidecar/src/meetings/recovery.rs) owns local session artifacts. The Electron [capture host](../../../apps/desktop/electron/main/capture.mjs) supervises the sidecar; serialized recording files remain compatible. Meeting lifecycle persistence, transcript transport and local capture recovery remain separate responsibilities across runtimes.
