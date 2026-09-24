import assert from "node:assert/strict";
import { test } from "vitest";

import { gmailQuotaBackoffMs, gmailQuotaReservationMessage, gmailQuotaUnits } from "./gmail-quota";

test("Gmail quota weights expensive reads and writes", () => {
  assert.equal(gmailQuotaUnits("/gmail/v1/users/me/history?startHistoryId=1", "GET"), 2);
  assert.equal(gmailQuotaUnits("/gmail/v1/users/me/threads", "GET"), 10);
  assert.equal(gmailQuotaUnits("/gmail/v1/users/me/threads/thread-1", "GET"), 40);
  assert.equal(gmailQuotaUnits("/gmail/v1/users/me/messages/message-1", "GET"), 20);
  assert.equal(gmailQuotaUnits("/gmail/v1/users/me/messages/send", "POST"), 100);
  assert.equal(gmailQuotaUnits("/batch/gmail/v1", "POST", 10), 400);
});

test("Gmail quota errors distinguish foreground exhaustion from the background reserve", () => {
  assert.match(gmailQuotaReservationMessage("foreground"), /temporarily exhausted/);
  assert.match(gmailQuotaReservationMessage("background"), /reserved for foreground/);
});

test("Gmail quota backoff uses bounded full jitter", () => {
  assert.equal(
    gmailQuotaBackoffMs(1, () => 0),
    1_000,
  );
  assert.equal(
    gmailQuotaBackoffMs(1, () => 0.5),
    15_000,
  );
  assert.equal(
    gmailQuotaBackoffMs(10, () => 1),
    900_000,
  );
});
