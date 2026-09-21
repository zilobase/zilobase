import type { Ports } from "@zilobase/runtime-ports";

import { createRuntimeEnv } from "../env";
import { createUrlResolver } from "../url-resolver";
import type { WorkerEnvBindings } from "./bindings";
import { createWorkerDocuments } from "./documents";
import { createWorkerFanout } from "./fanout";
import { createWorkerImageStorage } from "./image-storage";
import { createWorkerJobs } from "./jobs";
import { createWorkerLifecycle } from "./lifecycle";
import { createWorkerLimits } from "./limits";
import { createWorkerMailer } from "./mailer";
import { createWorkerMeetings } from "./meetings";
import { createWorkerOutboundFetch } from "./outbound-fetch";
import { createWorkerScheduler } from "./scheduler";
import {
  createWorkerTelemetry,
  type WorkerTelemetryOptions,
} from "./telemetry";

type WorkerRuntimePortOptions<Env> = {
  execution?: Parameters<typeof createWorkerScheduler>[0];
  storage?: Parameters<typeof createWorkerScheduler>[1];
  telemetry?: Omit<WorkerTelemetryOptions<Env>, "env">;
};

export function createWorkerRuntimePorts<Env extends WorkerEnvBindings>(
  env: Env,
  options: WorkerRuntimePortOptions<Env> = {},
): Partial<Ports> {
  const runtimeEnv = createRuntimeEnv(env, {
    DATABASE_URL: () => env.HYPERDRIVE?.connectionString,
    ZILOBASE_EDITION: () => "hosted",
  });

  return {
    ...(env.IMAGE_BUCKET
      ? { blobs: createWorkerImageStorage(env.IMAGE_BUCKET) }
      : {}),
    documents: createWorkerDocuments(env),
    env: runtimeEnv,
    fanout: createWorkerFanout(env),
    jobs: createWorkerJobs(env),
    lifecycle: createWorkerLifecycle(),
    limits: createWorkerLimits(env),
    mailer: createWorkerMailer({
      binding: env.EMAIL,
      developmentSinkUrl: env.ZILOBASE_DEV_EMAIL_SINK_URL,
    }),
    meetings: createWorkerMeetings(env),
    outbound: createWorkerOutboundFetch(),
    readiness: {
      background: () => ({ coordinatorReady: null, listenerReady: null }),
      realtime: () => true,
    },
    scheduler: createWorkerScheduler(options.execution, options.storage),
    telemetry: createWorkerTelemetry({ env, ...options.telemetry }),
    urls: createUrlResolver(runtimeEnv),
  };
}
