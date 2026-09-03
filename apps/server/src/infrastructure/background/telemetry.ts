import {
  context,
  propagation,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";

import type { BackgroundLane, BackgroundTaskKind } from "./contracts";
import { backgroundTaskLane, getBackgroundCellId, type BackgroundTaskV1 } from "./contracts";
import type { RuntimeEnv } from "../../shared/config/config";

export type BackgroundTelemetryAttributes = {
  cell: string;
  error_code?: string;
  kind: BackgroundTaskKind;
  lane: BackgroundLane;
  outcome: string;
  runtime: "cloudflare" | "node";
};

const counters = new Map<string, number>();
const histogramSums = new Map<string, { count: number; sum: number }>();
const tracer = trace.getTracer("zilobase.background", "1");

export function recordRecoveredBackgroundLease(
  env: RuntimeEnv,
  kind: BackgroundTaskKind,
) {
  recordBackgroundCounter("recovered_lease", backgroundAttributes(env, kind, "recovered"));
}

export async function measureBackgroundProvider<T>(
  env: RuntimeEnv,
  kind: BackgroundTaskKind,
  callback: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await callback();
    recordBackgroundHistogram(
      "provider_duration_ms",
      Date.now() - startedAt,
      backgroundAttributes(env, kind, "completed"),
    );
    return result;
  } catch (error) {
    recordBackgroundHistogram(
      "provider_duration_ms",
      Date.now() - startedAt,
      backgroundAttributes(env, kind, "failed"),
    );
    throw error;
  }
}

export function runBackgroundTaskSpan<T>(
  task: BackgroundTaskV1,
  attributes: BackgroundTelemetryAttributes,
  callback: () => Promise<T>,
) {
  const parent = propagation.extract(context.active(), {
    ...(task.traceparent ? { traceparent: task.traceparent } : {}),
    ...(task.tracestate ? { tracestate: task.tracestate } : {}),
  });
  return tracer.startActiveSpan(
    "zilobase.background.execute",
    {
      attributes: {
        "zilobase.background.cell": attributes.cell,
        "zilobase.background.kind": attributes.kind,
        "zilobase.background.lane": attributes.lane,
        "zilobase.background.runtime": attributes.runtime,
      },
    },
    parent,
    async (span) => {
      try {
        const result = await callback();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.name : "UnknownError",
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function recordBackgroundCounter(
  name: "enqueue" | "claim" | "completion" | "retry" | "terminal_failure" | "recovered_lease" | "dispatch_failure",
  attributes: BackgroundTelemetryAttributes,
  value = 1,
) {
  const key = metricKey(`zilobase.background.${name}`, attributes);
  counters.set(key, (counters.get(key) ?? 0) + value);
}

export function recordBackgroundHistogram(
  name: "queue_delay_ms" | "execution_duration_ms" | "provider_duration_ms" | "time_beyond_available_at_ms",
  value: number,
  attributes: BackgroundTelemetryAttributes,
) {
  const key = metricKey(`zilobase.background.${name}`, attributes);
  const current = histogramSums.get(key) ?? { count: 0, sum: 0 };
  histogramSums.set(key, {
    count: current.count + 1,
    sum: current.sum + Math.max(0, value),
  });
}

export function renderPrometheusBackgroundMetrics() {
  const lines: string[] = [];
  for (const [key, value] of counters) {
    const [name, labels] = splitMetricKey(key);
    lines.push(`# TYPE ${name} counter`, `${name}${labels} ${value}`);
  }
  for (const [key, value] of histogramSums) {
    const [name, labels] = splitMetricKey(key);
    lines.push(
      `# TYPE ${name} summary`,
      `${name}_count${labels} ${value.count}`,
      `${name}_sum${labels} ${value.sum}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function metricKey(name: string, attributes: BackgroundTelemetryAttributes) {
  const labels = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\u0000");
  return `${name}\u0001${labels}`;
}

function splitMetricKey(key: string): [string, string] {
  const [rawName = "zilobase_background_unknown", rawLabels = ""] = key.split("\u0001");
  const name = rawName.replaceAll(".", "_");
  const labels = rawLabels
    ? `{${rawLabels.split("\u0000").map((entry) => {
      const [label, ...rest] = entry.split("=");
      return `${label}="${rest.join("=").replace(/[\\"\n]/g, "_")}"`;
    }).join(",")}}`
    : "";
  return [name, labels];
}

function backgroundAttributes(
  env: RuntimeEnv,
  kind: BackgroundTaskKind,
  outcome: string,
): BackgroundTelemetryAttributes {
  return {
    cell: getBackgroundCellId(env),
    kind,
    lane: backgroundTaskLane(kind),
    outcome,
    runtime: env.HYPERDRIVE ? "cloudflare" : "node",
  };
}
