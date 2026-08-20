import assert from "node:assert/strict";
import { test } from "vitest";

import {
  clampMeetingDuration,
  getNextMeetingStatus,
  isMeetingRecordingActive,
} from "./meeting-state";
import { MEETING_MAX_DURATION_MS } from "./meeting-types";

test("meeting lifecycle only allows explicit transitions", () => {
  assert.equal(getNextMeetingStatus("idle", "start"), "recording");
  assert.equal(getNextMeetingStatus("recording", "pause"), "paused");
  assert.equal(getNextMeetingStatus("paused", "resume"), "recording");
  assert.equal(getNextMeetingStatus("recording", "stop"), "processing");
  assert.equal(getNextMeetingStatus("processing", "complete"), "completed");
  assert.throws(
    () => getNextMeetingStatus("completed", "resume"),
    /Cannot resume a meeting in completed state/,
  );
});

test("meeting duration is bounded to the three hour product limit", () => {
  assert.equal(clampMeetingDuration(-1), 0);
  assert.equal(clampMeetingDuration(1_234.6), 1_235);
  assert.equal(
    clampMeetingDuration(MEETING_MAX_DURATION_MS + 60_000),
    MEETING_MAX_DURATION_MS,
  );
  assert.equal(clampMeetingDuration(Number.NaN), 0);
});

test("a stopped meeting awaiting summary generation is deletable", () => {
  assert.equal(isMeetingRecordingActive("recording"), true);
  assert.equal(isMeetingRecordingActive("paused"), true);
  assert.equal(isMeetingRecordingActive("processing"), false);
  assert.equal(isMeetingRecordingActive("completed"), false);
  assert.equal(isMeetingRecordingActive("failed"), false);
  assert.equal(isMeetingRecordingActive("idle"), false);
});
