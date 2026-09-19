export type RuntimeKind = "node" | "worker";

export function resolveRuntimeKind(
  env: Record<string, unknown>,
): RuntimeKind {
  if (env.ZILOBASE_RUNTIME_KIND === "edge") return "worker";
  if (env.HYPERDRIVE) return "worker";
  if (env.PAGE_COLLABORATION) return "worker";
  if (env.CHAT_AGENT) return "worker";
  return "node";
}
