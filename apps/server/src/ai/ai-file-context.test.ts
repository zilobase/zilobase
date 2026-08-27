import assert from "node:assert/strict";
import { test } from "vitest";
import type { UIMessage } from "ai";

import { collectAiFileIds, withoutAiFileParts } from "./ai-file-context";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

test("collects requested and persisted owned-file references without duplicates", () => {
  const messages = [{
    id: "m1",
    role: "user",
    parts: [
      { type: "text", text: "review this" },
      {
        type: "file",
        filename: "brief.pdf",
        mediaType: "application/pdf",
        url: `/api/ai/files/${second}/download`,
      },
    ],
  }] as UIMessage[];

  assert.deepEqual(collectAiFileIds(messages, [first, second, "bad"]), [first, second]);
  assert.deepEqual(withoutAiFileParts(messages)[0]?.parts, [
    { type: "text", text: "review this" },
  ]);
});
