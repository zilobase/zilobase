import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | null = null;

export function startNodeTelemetry() {
  if (sdk || process.env.OTEL_SDK_DISABLED?.toLowerCase() === "true") return;
  const exportConfigured = Object.keys(process.env).some((key) =>
    key === "OTEL_EXPORTER_OTLP_ENDPOINT" || key.startsWith("OTEL_EXPORTER_OTLP_TRACES_")
  );
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || "zilobase-server",
    ...(!exportConfigured ? { spanProcessors: [] } : {}),
  });
  sdk.start();
}

export async function shutdownNodeTelemetry() {
  const active = sdk;
  sdk = null;
  await active?.shutdown();
}
