import type { Telemetry } from "@zilobase/runtime-ports";

export type WorkerTelemetryOptions<Env> = {
  env: Env;
  reportError?: (env: Env, error: unknown, properties: Record<string, unknown>) => void | Promise<void>;
  reportEvent?: (env: Env, event: string, properties?: Record<string, unknown>) => void | Promise<void>;
};

export function createWorkerTelemetry<Env>(
  options: WorkerTelemetryOptions<Env>,
): Telemetry {
  return {
    error(error, properties = {}) {
      if (options.reportError) return options.reportError(options.env, error, properties);
      console.warn(JSON.stringify({ event: "runtime.error", ...properties }));
    },
    event(name, properties) {
      if (options.reportEvent) return options.reportEvent(options.env, name, properties);
      console.info(JSON.stringify({ event: name, ...properties }));
    },
    metrics: () => "",
    health: async () => ({ healthy: true }),
  };
}
