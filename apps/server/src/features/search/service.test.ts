import assert from "node:assert/strict";
import { test } from "vitest";

import {
  SEARCH_HEADLINE_OPTIONS,
  stripSearchHeadlineMarkers,
} from "./service";

test("PostgreSQL headline options use non-empty selection markers", () => {
  assert.doesNotMatch(SEARCH_HEADLINE_OPTIONS, /StartSel=\s*(?:,|$)/);
  assert.doesNotMatch(SEARCH_HEADLINE_OPTIONS, /StopSel=\s*(?:,|$)/);
});

test("search excerpts remove internal headline markers", () => {
  assert.equal(
    stripSearchHeadlineMarkers(
      "The __ZILOBASE_MATCH_START__decision__ZILOBASE_MATCH_STOP__ is final.",
    ),
    "The decision is final.",
  );
  assert.equal(stripSearchHeadlineMarkers(null), null);
});
