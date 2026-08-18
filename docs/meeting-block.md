# Meeting block

The meeting block is an editor-native, collaborative recorder for the Zilobase desktop app. It captures local audio, streams short PCM windows for transcription, keeps notes and generated summaries in a meeting-scoped Yjs document, and stores the durable meeting state and transcript in Postgres.

The feature is off by default. It should remain behind `MEETING_BLOCK_ENABLED=false` until the database migrations, WebSocket endpoints, OpenAI credentials, and desktop release are deployed together.

## Architecture

```text
Desktop meeting block
  ├─ HTTPS /meetings/* ───────────────> lifecycle, consent, leases, transcript
  ├─ WS /meeting-collaboration ───────> Yjs notes and summary
  └─ WS /meeting-audio ───────────────> sequenced PCM16, 24 kHz, mono
                                             │
                                             ├─ OpenAI transcription
                                             └─ idempotent transcript segments

Postgres
  ├─ meeting
  ├─ meeting_collaboration_document
  ├─ meeting_transcript_segment
  └─ meeting_consent_event
```

Node deployments host both WebSocket paths in the server process. Cloud deployments route each meeting to dedicated `MeetingCollaborationRoom` and `MeetingAudioRoom` Durable Objects. Audio tickets and collaboration tickets are short-lived, signed, and scoped to one user, workspace, meeting, and recorder lease.

The native recorder uses CPAL, based on the capture patterns in Meetily. See `THIRD_PARTY_NOTICES.md` for attribution. Microphone capture works with ordinary input devices. System capture requires an OS-visible loopback or monitor input; the settings menu only enables it when such a device is detected. A native macOS process-audio tap is not included.

## Collaboration behavior

Only one editor may own the recorder lease at a time. The owner can start, pause, resume, and stop capture. Other collaborators continue editing notes and viewing incoming transcript segments, but their transport controls are disabled and the block says that another collaborator is recording.

Notes and summaries use a meeting-specific Yjs room. Transcript segments are append-only server records, ordered by audio sequence, and polled while a meeting is active or processing. Duplicate audio windows are ignored by their lease and sequence identity. A summary records how many transcript segments it used and is marked out of date when later segments arrive.

If the recorder disappears, its lease expires after missed heartbeats and another editor can claim it. A desktop reload can reuse the current tab's lease from session storage. Device disconnects terminate native capture with a visible error; local audio and checkpoint files remain available for recovery.

## Consent and privacy

Starting capture always opens a consent confirmation. The recorder may either confirm that participants were notified or play the configured message through local text-to-speech first. The server writes the exact message, mode, user, timestamp, and source metadata to `meeting_consent_event`. A recorder claim is rejected unless that user recorded consent during the preceding ten minutes.

This is a product safeguard, not legal advice. Workspace operators remain responsible for applicable consent, notice, employment, privacy, and data-residency requirements.

Raw audio is buffered in memory in roughly five-second transcription windows and is not persisted by the server. The desktop writes a local WAV file and checkpoint while recording. After a successful summary, the block deletes that local directory unless **Archive local audio** is enabled. If capture or summarization fails, it deliberately preserves the file for recovery. Notes, summaries, transcripts, and consent events remain in Postgres while the soft-deleted meeting record exists; deployments that require fixed retention must add a scheduled hard-delete policy.

## Configuration

Apply migrations `0039_meetings.sql`, `0040_meeting_recorder_lease.sql`, and `0041_meeting_summary_state.sql`, then configure:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MEETING_BLOCK_ENABLED` | Yes | Set to `true` only for the rollout cohort. |
| `OPENAI_API_KEY` | Yes | Transcription and structured summary generation. |
| `OPENAI_TRANSCRIPTION_MODEL` | No | Defaults to `gpt-4o-mini-transcribe`. |
| `COLLABORATION_SECRET` | Recommended | Signs collaboration and audio tickets; falls back to `BETTER_AUTH_SECRET`. |
| `MEETING_AUDIO_WEBSOCKET_URL` | No | Public audio WebSocket override. |
| `MEETING_COLLABORATION_WEBSOCKET_URL` | No | Public meeting Yjs WebSocket override. |

Cloudflare deployments must also deploy Durable Object migrations `v10` and `v11` and bind `MEETING_COLLABORATION` and `MEETING_AUDIO`. Keep `MEETING_BLOCK_ENABLED` false in `wrangler.jsonc` until the staged rollout begins.

## Rollout

1. Back up Postgres and apply the three migrations.
2. Deploy the server or Cloudflare adapter with the feature flag still disabled.
3. Verify both meeting WebSocket endpoints accept upgrades and reject missing or mismatched tickets.
4. Deploy a desktop build containing the native recorder.
5. Enable an internal workspace cohort and run a microphone-only meeting through consent, pause/resume, stop, transcript, summary, export, and local-file cleanup.
6. Repeat with two collaborators and verify only the lease owner has recorder controls while both users can edit notes and see transcript updates.
7. Test a supported loopback device separately on every desktop platform offered to users.
8. Watch `meeting_audio_runtime_error`, WebSocket upgrade failures, OpenAI latency/errors, recorder lease conflicts, and summary failures before widening access.

Rollback is configuration-only: set `MEETING_BLOCK_ENABLED=false`. Existing blocks remain in page documents but API operations return 404. Do not roll back the additive database or Durable Object migrations during an incident.

## Verification

Run these checks before release:

```sh
npm run build --workspace @zilobase/server
npm test --workspace @zilobase/server -- --run src/features/meetings
npm run build --workspace @zilobase/web
(cd apps/desktop/src-tauri && cargo check && cargo test meeting_capture --lib)
(cd ../zilobase-cloud-adapter && npm run build && npm test)
```

Manual desktop acceptance still matters because CI cannot grant microphone permission or validate physical and virtual audio devices. Cover permission denial, device disconnect, network interruption, application restart recovery, a three-hour forced stop, and local audio deletion with archiving both off and on.
