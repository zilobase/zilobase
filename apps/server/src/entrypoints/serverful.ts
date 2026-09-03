// Node process entrypoint for self-hosted and serverful deployments.
import { startNodeTelemetry } from "../infrastructure/background/node-telemetry";

async function main() {
  startNodeTelemetry();
  await import("../app/node/server");
}

void main().catch((error) => {
  console.error("Failed to start the Zilobase server", error);
  process.exitCode = 1;
});
