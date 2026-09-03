// Node process entrypoint for self-hosted and serverful deployments.
import { startNodeTelemetry } from "../infrastructure/background/node-telemetry";

startNodeTelemetry();
await import("../app/node/server");
