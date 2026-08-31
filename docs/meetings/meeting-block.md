# Meeting block

The meeting block is an editor-native, collaborative recorder for the Zilobase desktop and web apps. It captures local audio, streams each active source through its own persistent realtime transcription session, keeps notes, generated summaries, and transcripts in a meeting-scoped Yjs document rendered with the full page editor, and stores finalized meeting state and transcript segments in Postgres. Partial speech is read-only live text; a completed turn becomes one durable editor paragraph. Summary generation replaces the collaborative summary document, after which collaborators can edit it like meeting notes. The block header matches the inline database title, icon, cover, properties spacing, more-menu, expand, and primary-action layout. Meetings in the sidebar open `/m/:meetingId`; an embedded block includes a page-icon tab action that returns to its host page.

The feature is always gated by `MEETING_BLOCK_ENABLED`. New deployments should keep it `false` until the database migrations, both WebSocket endpoints, OpenAI credentials, and a compatible desktop release are deployed together. Rollback remains a flag-only change.

## Architecture

```text
Desktop or web meeting block
  ├─ HTTPS /meetings/* ───────────────> access, consent, initial recorder claim
  ├─ WS /meeting-collaboration ─┐
  └─ WS /meeting-audio ─────────┴──> Node server
                                        ├─ Hocuspocus Yjs room
                                        ├─ Postgres recorder lease/checkpoints
                                        └─ one OpenAI Realtime session per active source

                                   │ idempotent persistence
                                   ▼

Postgres
  ├─ meeting (completed lifecycle/archive metadata)
  ├─ page (type=meeting, notes)
  ├─ meeting_collaboration_document
  ├─ meeting_transcript_segment
  └─ meeting_consent_event
```

Node deployments host both WebSocket paths in the server process. Postgres owns the recorder lease and completed transcript segments; Hocuspocus owns the live Yjs document, and the audio socket renews its lease and rotates its ticket without browser polling. An expired lease left by a terminated process is recovered to `processing` the next time a recorder claim is attempted, so a meeting cannot remain permanently stuck in `recording`. A horizontally scaled deployment must keep a meeting's WebSocket traffic on one process through connection affinity or an equivalent single-owner gateway. The process-local OpenAI session is deliberately not presented as a distributed coordinator. Database constraints make completed segment writes idempotent, while affinity prevents two processes from briefly transcribing the same live lease.

A meeting collaboration ticket contains authorization and a WebSocket URL only. Opening or refreshing a meeting loads collaborative state through the WebSocket rather than placing the full Yjs snapshot in the ticket response.

The server connects to OpenAI Realtime with `intent=transcription`; the transcription model is selected only in the transcription `session.update`. Meetings default to `gpt-live-transcribe` with `delay: minimal`, which emits partial text while speech is still arriving. Each source has an independent OpenAI input buffer so microphone speech and system speech can be recognized concurrently instead of competing inside a mono mix. The session sets `turn_detection: null`; application-side PCM activity detection commits a completed turn after 500 ms of silence, with a 30-second maximum turn bound. Pause and stop manually commit all source buffers and wait for every final result so the last phrase from either lane is not lost. Backend connections include a stable SHA-256 safety identifier derived from the authenticated user ID; the raw internal ID is not disclosed to OpenAI.

Both browser and native clients use the `zilobase.meeting-audio.v2` protocol. A binary packet contains an eight-byte frame sequence, one source byte, and PCM16 payload. Clients declare their active sources, wait for every provider lane to be ready, and only then send PCM. They retain bounded, source-aware replay windows and reconcile them against the server's `nextSequences` watermarks after every reconnect or resume. A recovery watermark advances only after that source's provider turn completes and its transcript checkpoint succeeds; merely receiving an audio frame is not an acknowledgement that it was transcribed. If a watermark falls in the middle of a 100 ms packet, the server and client trim only the acknowledged 20 ms frames rather than dropping the packet's new tail. This gives process restarts a recoverable audio boundary without persisting raw audio server-side. Permanent provider configuration errors preserve the provider close code/reason, close the audio channel with application code `4400`, and are not retried. Transient disconnects keep the recorder lease recoverable, rewind each lane to its last completed turn, and use bounded exponential reconnects (six attempts), while the local recovery recording continues independently.

The native recorder uses CPAL, based on the capture patterns in Meetily. See `THIRD_PARTY_NOTICES.md` for attribution. Current macOS releases use Core Audio process taps, Windows uses WASAPI output loopback, and Linux prefers PipeWire with PulseAudio/ALSA monitor inputs as fallbacks. Virtual inputs such as BlackHole remain supported. The web recorder uses `getUserMedia` for microphone audio and the browser's `getDisplayMedia` sharing chooser for tab/system audio; browsers that do not return a display-audio track continue microphone-only.

| Client | Primary system-audio path | Fallback |
| --- | --- | --- |
| macOS desktop | Core Audio process tap on the selected output | BlackHole or another virtual input on unsupported macOS releases |
| Windows desktop | WASAPI loopback on the selected output | Stereo Mix or a virtual input |
| Linux desktop | PipeWire capture-sink stream | PulseAudio/ALSA monitor or virtual input |
| Desktop web | Browser tab/system audio from the screen-share chooser | Microphone-only when the browser or selected share supplies no audio track |
| Mobile web | Microphone capture | Microphone-only; mobile browsers do not provide dependable system-audio sharing |

Microphone and system streams are resampled independently to 24 kHz mono and grouped into source-tagged 100 ms transport packets. They are mixed only for the local level meter and stereo recovery file, never for transcription. The browser drains each source's queued 20 ms frames independently after background-timer throttling, so a late callback from one device does not manufacture silence or shift the other source's transcript. This batching reduces edge WebSocket message invocations by about 80% without making captions feel delayed. Both clients enforce the three-hour product limit. Local recovery preserves the sources as separate WAV channels. Desktop recovery is stored in the application data directory; web recovery is best-effort IndexedDB storage and can be downloaded as WAV. Neither client stores shared video.

## Collaboration behavior

Only one editor may own the recorder lease at a time. The owner can start, pause, resume, and stop capture. Lifecycle endpoints require that exact user's recorder lease; UI hiding is not the security boundary. Other collaborators continue editing notes and viewing incoming transcript text, see the recorder's name, and are not shown transport controls.

Notes, summaries, and transcripts use one meeting-specific Yjs room. The recorder receives each provider delta directly, while source-specific `liveTranscript:microphone` and `liveTranscript:system` maps are replaced at most four times per second so every collaborator can see both speakers while they overlap. The client selects the newest draft from each lane, maps microphone to `You` and system audio to `Others`, orders the drafts by meeting timestamp, and presents them in one transcript timeline. Each draft is a transient, read-only `[m:ss] You: text` or `[m:ss] Others: text` paragraph using the same typography and spacing as finalized transcript paragraphs; drafts are not inserted into the Yjs transcript, persistence, or undo history. Each completed activity-detected turn replaces only its source's decoration with one generated Yjs paragraph and one Postgres transcript checkpoint. Source metadata is retained so labels remain correct after reconnects. The room reconstructs missed transcript state from those rows instead of repeatedly writing the entire growing Yjs document. A server-side Yjs sync guard rejects client mutations to transcript nodes while any recorder lease exists; notes and summary remain collaborative.

Pause, resume, and stop are acknowledged commands on the existing audio WebSocket. Pause finishes the current provider turn without releasing ownership. Completed turns are persisted incrementally; the acknowledged audio stop performs the durable lifecycle transition before the client receives completion. Summary generation checks the database lease so it cannot race an active or still-finalizing recording. There is no five-second meeting polling or recorder heartbeat HTTP request. The UI derives live state, recorder identity, and live words from Yjs. A summary records how many finalized transcript segments it used and is marked out of date when later segments arrive.

If the recorder socket disappears, the room allows a short ten-second reconnect window. Expired Postgres recorder leases are recovered before another user can claim the meeting. A desktop reload can reuse the current tab's lease from session storage. Device disconnects terminate native capture with a visible error; local audio and checkpoint files remain available for recovery.

## Consent and privacy

Starting capture always opens a consent confirmation. The recorder may either confirm that participants were notified or play the configured message through local text-to-speech first. The server writes the exact message, mode, user, timestamp, and source metadata to `meeting_consent_event`. A recorder claim is rejected unless that user recorded consent during the preceding ten minutes.

This is a product safeguard, not legal advice. Workspace operators remain responsible for applicable consent, notice, employment, privacy, and data-residency requirements.

Raw audio is sent continuously to the provider and is not persisted by the server. The server coalesces only a 100 ms outbound packet; application-side PCM activity detection finds natural turn boundaries and explicitly commits them to OpenAI. Long leading-silence buffers are cleared without creating transcript turns. The desktop writes a local WAV file and checkpoint while recording. After a successful summary, the block deletes that local directory unless **Archive local audio** is enabled. If capture or summarization fails, it deliberately preserves the file for recovery. Notes, summaries, transcripts, and consent events remain durable while the soft-deleted meeting record exists; deployments that require fixed retention must add a scheduled hard-delete policy.

## Configuration

Apply migrations `0039_meetings.sql`, `0040_meeting_recorder_lease.sql`, `0041_meeting_summary_state.sql`, `0042_meeting_notes_page.sql`, and `0043_meeting_transcript_sources.sql`, then configure:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MEETING_BLOCK_ENABLED` | Yes | Set to `true` only for the rollout cohort. |
| `OPENAI_API_KEY` | Yes | Transcription and structured summary generation. |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | No | Persistent live transcription model; defaults to `gpt-live-transcribe`. The OpenAI project must have model access. Capturing microphone and system audio together opens two provider sessions and bills both audio streams. |
| `COLLABORATION_SECRET` | Recommended | Signs collaboration and audio tickets; falls back to `BETTER_AUTH_SECRET`. |
| `MEETING_AUDIO_WEBSOCKET_URL` | No | Public audio WebSocket override. |
| `MEETING_COLLABORATION_WEBSOCKET_URL` | No | Public meeting Yjs WebSocket override. |

Keep `MEETING_BLOCK_ENABLED` false until the staged rollout begins.

## Rollout

1. Back up Postgres and apply the five migrations.
2. Deploy the server with the feature flag still disabled.
3. Verify both meeting WebSocket endpoints accept upgrades and reject missing or mismatched tickets.
4. Deploy a desktop build containing the native recorder and the web capture provider.
5. Enable an internal workspace cohort and run microphone-only and microphone-plus-system meetings through consent, pause/resume, stop, transcript, summary, export, and local-file cleanup.
6. Repeat with two collaborators and verify only the lease owner has recorder controls while both users can edit notes and see transcript updates.
7. Test native output loopback and a fallback monitor/virtual input separately on every desktop platform offered to users; test browser system-audio fallback separately.
8. Watch `meeting_audio_runtime_error`, WebSocket upgrade failures, OpenAI latency/errors, recorder lease conflicts, and summary failures before widening access.

Rollback is configuration-only: set `MEETING_BLOCK_ENABLED=false`. Existing blocks remain in page documents but API operations return 404. Do not roll back additive database migrations during an incident.

## Verification

Run these checks before release:

```sh
npm run build --workspace @zilobase/server
npm test --workspace @zilobase/server -- src/features/meetings
npm run build --workspace @zilobase/web
(cd apps/desktop/src-tauri && cargo check && cargo test meeting_capture --lib)
```

Manual acceptance still matters because CI cannot grant capture permission or validate physical and virtual audio devices. Cover each desktop OS, desktop Chrome/Edge/Safari/Firefox as offered, and mobile Safari/Chrome microphone fallback. Verify permission denial, a share without audio, device disconnect, network interruption, application restart recovery, a three-hour forced stop, and local audio deletion with archiving both off and on.
