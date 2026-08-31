import type { AgentLiveEffect } from "./effect-contract";

export type AgentDebugEvent = {
  completed?: number;
  detail?: string;
  effectKind?: AgentLiveEffect["kind"];
  eventId: string;
  kind:
    | "stream-open"
    | "tool-input-start"
    | "tool-input-progress"
    | "tool-start"
    | "step-start"
    | "step-finish"
    | "row-progress"
    | "effect"
    | "tool-finish";
  label?: string;
  sequence: number;
  serverAt: string;
  status?: "running" | "succeeded" | "failed";
  toolCallId?: string;
  toolName?: string;
  total?: number;
};

export function isAgentDebugEvent(value: unknown): value is AgentDebugEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;

  return (
    typeof event.eventId === "string" &&
    typeof event.sequence === "number" &&
    typeof event.serverAt === "string" &&
    (event.kind === "stream-open" ||
      event.kind === "tool-input-start" ||
      event.kind === "tool-input-progress" ||
      event.kind === "tool-start" ||
      event.kind === "step-start" ||
      event.kind === "step-finish" ||
      event.kind === "row-progress" ||
      event.kind === "effect" ||
      event.kind === "tool-finish")
  );
}
