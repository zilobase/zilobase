import { parseHTML } from "linkedom"

export function register({ assert, loadModule, test }) {
  test("live transcript preview uses the persisted [m:ss] text format", async () => {
    const {
      createMeetingTranscriptPreviewElement,
      formatMeetingTranscriptPreviewText,
    } = await loadModule(
      "/src/features/editor/extensions/meeting-transcript-preview.ts",
    )

    assert.equal(
      formatMeetingTranscriptPreviewText(5_999, "Hello team"),
      "[0:05] Hello team",
    )
    assert.equal(
      formatMeetingTranscriptPreviewText(3_661_000, "Next item"),
      "[61:01] Next item",
    )
    assert.equal(
      formatMeetingTranscriptPreviewText(-1_000, "Starting"),
      "[0:00] Starting",
    )
    assert.equal(
      formatMeetingTranscriptPreviewText(7_000, "Local speaker", "You"),
      "[0:07] You: Local speaker",
    )
    assert.equal(
      formatMeetingTranscriptPreviewText(8_000, "Remote speaker", "Others"),
      "[0:08] Others: Remote speaker",
    )

    const previousDocument = globalThis.document
    globalThis.document = parseHTML("<!doctype html><html><body></body></html>").document
    try {
      const preview = createMeetingTranscriptPreviewElement({
        itemId: "turn-1",
        kind: "live",
        speaker: "You",
        startMs: 5_999,
        text: "Hello team",
      })
      assert.equal(preview.localName, "p")
      assert.equal(preview.textContent, "[0:05] You: Hello team")
      assert.equal(preview.getAttribute("contenteditable"), "false")
      assert.equal(preview.querySelector(".meeting-transcript-preview-indicator"), null)
    } finally {
      globalThis.document = previousDocument
    }
  })

  test("microphone and system drafts render as one speaker-labeled timeline", async () => {
    const { combineMeetingTranscriptDrafts } = await loadModule(
      "/src/features/editor/extensions/meeting-transcript-preview.ts",
    )

    assert.deepEqual(
      combineMeetingTranscriptDrafts(
        [
          {
            itemId: "old-microphone-turn",
            source: "microphone",
            startMs: 1_000,
            text: "Old local draft",
            updatedAt: 10,
          },
          {
            itemId: "system-turn",
            source: "system",
            startMs: 2_000,
            text: "Remote speaker",
            updatedAt: 20,
          },
        ],
        [{
          itemId: "microphone-turn",
          source: "microphone",
          startMs: 3_000,
          text: "Local speaker",
          updatedAt: 30,
        }],
      ),
      [
        {
          itemId: "system-turn",
          kind: "live",
          speaker: "Others",
          startMs: 2_000,
          text: "Remote speaker",
        },
        {
          itemId: "microphone-turn",
          kind: "live",
          speaker: "You",
          startMs: 3_000,
          text: "Local speaker",
        },
      ],
    )
  })

  test("summary-ready meetings do not keep a finishing transcript footer", async () => {
    const { resolveMeetingTranscriptPreview } = await loadModule(
      "/src/features/editor/extensions/meeting-transcript-preview.ts",
    )

    assert.equal(
      resolveMeetingTranscriptPreview({
        activity: null,
        effectiveMeetingStatus: "processing",
        livePreview: [],
        transcriptSegmentCount: 7,
        visible: true,
      }),
      null,
    )
    assert.deepEqual(
      resolveMeetingTranscriptPreview({
        activity: "finishing",
        effectiveMeetingStatus: "processing",
        livePreview: [],
        transcriptSegmentCount: 7,
        visible: true,
      }),
      [{
        itemId: null,
        kind: "status",
        text: "Finishing the transcript…",
      }],
    )
  })

  test("meeting transcript preview follows only within 96px of the bottom", async () => {
    const previousDocument = globalThis.document
    const previousWindow = globalThis.window
    const scrollContainer = {
      clientHeight: 300,
      parentElement: null,
      scrollHeight: 1_000,
      scrollTop: 604,
    }
    const editor = { parentElement: scrollContainer }

    globalThis.document = { scrollingElement: null }
    globalThis.window = {
      getComputedStyle: () => ({ overflowY: "auto" }),
      innerHeight: 0,
      scrollY: 0,
    }

    try {
      const { isNearScrollEnd } = await loadModule(
        "/src/features/editor/extensions/meeting-transcript-scroll.ts",
      )

      assert.equal(isNearScrollEnd(editor), true)
      scrollContainer.scrollTop = 603
      assert.equal(isNearScrollEnd(editor), false)
    } finally {
      globalThis.document = previousDocument
      globalThis.window = previousWindow
    }
  })
}
