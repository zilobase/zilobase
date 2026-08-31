import type {
  AgentDebugEvent,
  AgentLiveEffect,
  AgentProgressSnapshot,
  AgentProgressStep,
  ZilobaseChatMessage,
} from "@zilobase/features/ai-chat/live-agent";
import type { UIMessageStreamWriter } from "ai";

type AgentLiveEffectInput = AgentLiveEffect extends infer Effect
  ? Effect extends AgentLiveEffect
    ? Omit<Effect, "effectId">
    : never
  : never;

export type AgentProgressPublisher = {
  attach(writer: UIMessageStreamWriter<ZilobaseChatMessage>): void;
  effect(effect: AgentLiveEffectInput): void;
  failRunningTools(detail: string): void;
  finishTool(input: {
    detail?: string;
    failed?: boolean;
    toolCallId: string;
  }): void;
  setRowProgress(input: {
    completed: number;
    toolCallId: string;
    total: number;
  }): void;
  startStep(input: {
    detail?: string;
    key: string;
    label: string;
    phase: AgentProgressSnapshot["currentPhase"];
    toolCallId: string;
  }): void;
  startTool(input: {
    title: string;
    toolCallId: string;
    toolName: string;
  }): void;
  finishStep(input: {
    detail?: string;
    failed?: boolean;
    key: string;
    toolCallId: string;
  }): void;
};

export function createAgentProgressPublisher(options?: {
  debug?: boolean;
  onFirstProgress?: () => void;
}): AgentProgressPublisher {
  const snapshots = new Map<string, AgentProgressSnapshot>();
  let writer: UIMessageStreamWriter<ZilobaseChatMessage> | null = null;
  let sequence = 0;
  let debugSequence = 0;
  let firstProgressPublished = false;

  const debug = (
    event: Omit<AgentDebugEvent, "eventId" | "sequence" | "serverAt">,
  ) => {
    if (!options?.debug) return;
    writer?.write({
      data: {
        ...event,
        eventId: crypto.randomUUID(),
        sequence: ++debugSequence,
        serverAt: new Date().toISOString(),
      },
      transient: true,
      type: "data-agent-debug",
    });
  };

  const publish = (snapshot: AgentProgressSnapshot) => {
    snapshots.set(snapshot.toolCallId, snapshot);
    if (!firstProgressPublished) {
      firstProgressPublished = true;
      options?.onFirstProgress?.();
    }
    writer?.write({
      data: snapshot,
      id: `agent-progress:${snapshot.toolCallId}`,
      type: "data-agent-progress",
    });
  };

  const update = (
    toolCallId: string,
    change: (current: AgentProgressSnapshot) => AgentProgressSnapshot,
  ) => {
    const current = snapshots.get(toolCallId);
    if (!current) return;
    const next = change(current);
    publish({
      ...next,
      sequence: ++sequence,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateStep = (
    steps: AgentProgressStep[],
    key: string,
    change: (step: AgentProgressStep) => AgentProgressStep,
  ) => {
    const index = steps.findIndex((step) => step.key === key);
    if (index < 0) return steps;
    const next = [...steps];
    next[index] = change(next[index]!);
    return next;
  };

  return {
    attach(nextWriter) {
      writer = nextWriter;
      debug({ kind: "stream-open", status: "running" });
      for (const snapshot of snapshots.values()) publish(snapshot);
    },
    effect(effect) {
      debug({
        effectKind: effect.kind,
        kind: "effect",
        status: "running",
        toolCallId: effect.toolCallId,
      });
      writer?.write({
        data: { ...effect, effectId: crypto.randomUUID() } as AgentLiveEffect,
        transient: true,
        type: "data-agent-effect",
      });
    },
    failRunningTools(detail) {
      for (const snapshot of snapshots.values()) {
        if (snapshot.status !== "running") continue;
        debug({
          detail,
          kind: "tool-finish",
          status: "failed",
          toolCallId: snapshot.toolCallId,
          toolName: snapshot.toolName,
        });
        update(snapshot.toolCallId, (current) => ({
          ...current,
          currentPhase: "finalizing",
          status: "failed",
          steps: current.steps.map((step) =>
            step.status === "running"
              ? { ...step, detail, status: "failed" as const }
              : step
          ),
        }));
      }
    },
    finishStep({ detail, failed = false, key, toolCallId }) {
      const step = snapshots.get(toolCallId)?.steps.find((item) => item.key === key);
      debug({
        ...(detail ? { detail } : {}),
        kind: "step-finish",
        ...(step ? { label: step.label } : {}),
        status: failed ? "failed" : "succeeded",
        toolCallId,
        toolName: snapshots.get(toolCallId)?.toolName,
      });
      update(toolCallId, (current) => ({
        ...current,
        steps: updateStep(current.steps, key, (step) => ({
          ...step,
          ...(detail ? { detail } : {}),
          status: failed ? "failed" : "completed",
        })),
      }));
    },
    finishTool({ detail, failed = false, toolCallId }) {
      const snapshot = snapshots.get(toolCallId);
      debug({
        ...(detail ? { detail } : {}),
        kind: "tool-finish",
        status: failed ? "failed" : "succeeded",
        toolCallId,
        toolName: snapshot?.toolName,
      });
      update(toolCallId, (current) => {
        const activeSteps = current.steps.map((step) =>
          step.status === "running"
            ? {
                ...step,
                ...(detail ? { detail } : {}),
                status: failed ? "failed" as const : "completed" as const,
              }
            : step
        );
        return {
          ...current,
          currentPhase: "finalizing",
          status: failed ? "failed" : "succeeded",
          steps: activeSteps,
        };
      });
    },
    setRowProgress({ completed, toolCallId, total }) {
      debug({
        completed,
        kind: "row-progress",
        status: "running",
        toolCallId,
        toolName: snapshots.get(toolCallId)?.toolName,
        total,
      });
      update(toolCallId, (current) => ({
        ...current,
        currentPhase: "rows",
        rowProgress: { completed, total },
      }));
    },
    startStep({ detail, key, label, phase, toolCallId }) {
      debug({
        ...(detail ? { detail } : {}),
        kind: "step-start",
        label,
        status: "running",
        toolCallId,
        toolName: snapshots.get(toolCallId)?.toolName,
      });
      update(toolCallId, (current) => {
        const existing = current.steps.find((step) => step.key === key);
        return {
          ...current,
          currentPhase: phase,
          steps: existing
            ? updateStep(current.steps, key, (step) => ({
                ...step,
                ...(detail ? { detail } : {}),
                label,
                status: "running",
              }))
            : [
                ...current.steps,
                {
                  ...(detail ? { detail } : {}),
                  key,
                  label,
                  status: "running" as const,
                },
              ],
        };
      });
    },
    startTool({ title, toolCallId, toolName }) {
      const now = new Date().toISOString();
      debug({
        kind: "tool-start",
        label: title,
        status: "running",
        toolCallId,
        toolName,
      });
      const existing = snapshots.get(toolCallId);
      publish(existing
        ? {
            ...existing,
            sequence: ++sequence,
            title,
            toolName,
            updatedAt: now,
          }
        : {
            currentPhase: "planning",
            sequence: ++sequence,
            startedAt: now,
            status: "running",
            steps: [],
            title,
            toolCallId,
            toolName,
            updatedAt: now,
          });
    },
  };
}
