import type { Telemetry, TelemetryProperties } from "@zilobase/runtime-ports";

export type NodeTelemetryOptions = {
  health?: () => Promise<Record<string, unknown>>;
  metrics?: () => Promise<string> | string;
};

export function createNodeTelemetry(options: NodeTelemetryOptions = {}): Telemetry {
  return {
    error(error, properties) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "runtime.error",
        ...properties,
      }));
    },
    event(name, properties) {
      console.info(JSON.stringify({ event: name, ...properties }));
    },
    metrics: () => options.metrics?.() ?? "",
    health: () => options.health?.() ?? Promise.resolve({ healthy: true }),
  };
}

export type { TelemetryProperties };
