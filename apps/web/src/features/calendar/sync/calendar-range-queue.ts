import { emitCalendarMetric } from "../metrics";
import { missingCalendarRanges, type CalendarWindow } from "./range-coverage";

type Job = CalendarWindow & {
  scope: string;
  account: string;
  priority: number;
  active: boolean;
  consumers: number;
  controller: AbortController;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  run: (range: CalendarWindow, signal: AbortSignal) => Promise<void>;
};
const jobs = new Set<Job>();
function drain() {
  let active = [...jobs].filter((j) => j.active).length;
  for (const job of [...jobs].filter((j) => !j.active).sort((a, b) => b.priority - a.priority)) {
    const perAccount = [...jobs].filter((j) => j.active && j.account === job.account).length;
    // Preserve a foreground slot globally and within each account.
    if (active >= (job.priority >= 10 ? 4 : 3) || perAccount >= (job.priority >= 10 ? 2 : 1))
      continue;
    job.active = true;
    active++;
    void job
      .run(job, job.controller.signal)
      .then(job.resolve, job.reject)
      .finally(() => {
        jobs.delete(job);
        drain();
      });
  }
}
function subscribe(job: Job, signal?: AbortSignal) {
  job.consumers++;
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", abort);
      job.consumers--;
      if (!job.consumers) {
        job.controller.abort();
        if (!job.active) {
          jobs.delete(job);
          job.resolve();
        }
      }
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new DOMException("Calendar read cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    job.promise.then(() => finish(), finish);
    if (signal?.aborted) abort();
  });
}
/** Shared consumers join overlaps; only uncovered intervals create provider work. */
export function requestCalendarIntervals(
  scope: string,
  account: string,
  range: CalendarWindow,
  run: Job["run"],
  priority = 0,
  signal?: AbortSignal,
) {
  if (signal?.aborted)
    return Promise.reject(new DOMException("Calendar read cancelled", "AbortError"));
  const overlaps = [...jobs].filter(
    (j) =>
      j.scope === scope &&
      !j.controller.signal.aborted &&
      Date.parse(j.start) < Date.parse(range.end) &&
      Date.parse(j.end) > Date.parse(range.start),
  );
  if (overlaps.length) emitCalendarMetric("duplicate_read", overlaps.length);
  for (const job of overlaps) job.priority = Math.max(job.priority, priority);
  for (const missing of missingCalendarRanges(range.start, range.end, overlaps)) {
    let resolve!: () => void, reject!: (error: unknown) => void;
    const promise = new Promise<void>((a, b) => {
      resolve = a;
      reject = b;
    });
    const job: Job = {
      ...missing,
      scope,
      account,
      priority,
      active: false,
      consumers: 0,
      controller: new AbortController(),
      promise,
      resolve,
      reject,
      run,
    };
    jobs.add(job);
    overlaps.push(job);
  }
  const result = Promise.all(overlaps.map((j) => subscribe(j, signal))).then(() => {});
  drain();
  return result;
}
