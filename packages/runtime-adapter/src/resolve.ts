export type RuntimeKind = "node" | "worker";

export function resolveRuntimeKind(
  env: Record<string, unknown>,
): RuntimeKind {
  const configured = env.ZILOBASE_RUNTIME_KIND;
  if (configured === undefined || configured === "" || configured === "node") {
    return "node";
  }
  if (configured === "worker") return "worker";
  throw new Error("ZILOBASE_RUNTIME_KIND must be either 'node' or 'worker'");
}
