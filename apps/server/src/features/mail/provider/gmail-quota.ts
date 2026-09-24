import { eq, sql } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { gmailApiBudget } from "../../../infrastructure/database/schema";
import { GmailApiError } from "./gmail-gateway";

const CAPACITY = 5_000;
const REFILL_UNITS_PER_SECOND = 83;
const BACKGROUND_RESERVE = 1_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export type GmailTrafficClass = "background" | "foreground";

export type GmailQuotaGuard = {
  recordQuotaFailure(error: GmailApiError): Promise<void>;
  reserve(units: number): Promise<void>;
};

export function createGmailQuotaGuard(
  googleSubject: string,
  trafficClass: GmailTrafficClass,
): GmailQuotaGuard {
  return {
    recordQuotaFailure: (error) => recordGmailQuotaFailure(googleSubject, error),
    reserve: (units) => reserveGmailQuota(googleSubject, units, trafficClass),
  };
}

export async function reserveGmailQuota(
  googleSubject: string,
  units: number,
  trafficClass: GmailTrafficClass,
) {
  const requested = Math.max(1, Math.ceil(units));
  const reserve = trafficClass === "background" ? BACKGROUND_RESERVE : 0;
  await db
    .insert(gmailApiBudget)
    .values({ googleSubject })
    .onConflictDoNothing({ target: gmailApiBudget.googleSubject });

  const result = await db.execute(sql<{ blocked_until: Date | string | null }>`
    update gmail_api_budget
    set available_units = least(
          ${CAPACITY},
          available_units + floor(extract(epoch from (current_timestamp - refilled_at)) * ${REFILL_UNITS_PER_SECOND})::integer
        ) - ${requested},
        refilled_at = current_timestamp,
        updated_at = current_timestamp
    where google_subject = ${googleSubject}
      and (blocked_until is null or blocked_until <= current_timestamp)
      and least(
        ${CAPACITY},
        available_units + floor(extract(epoch from (current_timestamp - refilled_at)) * ${REFILL_UNITS_PER_SECOND})::integer
      ) - ${requested} >= ${reserve}
    returning blocked_until
  `);
  if (result.rows.length) return;

  const [budget] = await db
    .select({ blockedUntil: gmailApiBudget.blockedUntil })
    .from(gmailApiBudget)
    .where(eq(gmailApiBudget.googleSubject, googleSubject))
    .limit(1);
  const retryAfterMs = Math.max(
    1_000,
    budget?.blockedUntil ? budget.blockedUntil.getTime() - Date.now() : 15_000,
  );
  throw new GmailApiError(
    gmailQuotaReservationMessage(trafficClass),
    429,
    "quota_exceeded",
    true,
    retryAfterMs,
  );
}

export function gmailQuotaReservationMessage(trafficClass: GmailTrafficClass) {
  return trafficClass === "background"
    ? "Gmail quota is temporarily reserved for foreground mail operations."
    : "Gmail quota is temporarily exhausted. Try again after a short pause.";
}

export async function recordGmailQuotaFailure(
  googleSubject: string,
  error: GmailApiError,
  random = Math.random,
) {
  if (error.code !== "quota_exceeded") return;
  await db
    .insert(gmailApiBudget)
    .values({ googleSubject })
    .onConflictDoNothing({ target: gmailApiBudget.googleSubject });
  const [current] = await db
    .select({ failures: gmailApiBudget.consecutiveQuotaFailures })
    .from(gmailApiBudget)
    .where(eq(gmailApiBudget.googleSubject, googleSubject))
    .limit(1);
  const failures = (current?.failures ?? 0) + 1;
  const delay = Math.max(error.retryAfterMs ?? 0, gmailQuotaBackoffMs(failures, random));
  await db
    .update(gmailApiBudget)
    .set({
      blockedUntil: new Date(Date.now() + delay),
      consecutiveQuotaFailures: failures,
      updatedAt: new Date(),
    })
    .where(eq(gmailApiBudget.googleSubject, googleSubject));
}

export function gmailQuotaBackoffMs(failures: number, random = Math.random) {
  const ceiling = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** Math.max(0, failures - 1));
  return Math.max(1_000, Math.floor(random() * ceiling));
}

export function gmailQuotaUnits(path: string, method: string, batchSize = 0) {
  if (batchSize) return batchSize * 40;
  if (path.includes("/batchModify")) return 50;
  if (path.endsWith("/watch")) return 100;
  if (path.endsWith("/stop")) return 50;
  if (path.includes("/drafts/send") || path.endsWith("/messages/send")) return 100;
  if (path.includes("/drafts")) {
    if (method === "GET") return path.match(/\/drafts\/[^/?]+/) ? 5 : 5;
    return method === "PUT" ? 15 : 10;
  }
  if (path.includes("/attachments/")) return 20;
  if (path.includes("/history")) return 2;
  if (path.endsWith("/profile")) return 1;
  if (path.includes("/labels")) return method === "GET" ? 1 : 5;
  if (path.includes("/threads/")) return path.endsWith("/modify") ? 10 : 40;
  if (path.endsWith("/threads") || path.includes("/threads?")) return 10;
  if (path.includes("/messages/")) return method === "GET" ? 20 : 5;
  if (path.endsWith("/messages") || path.includes("/messages?")) return 5;
  return 5;
}
