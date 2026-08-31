"use client";

import {
  isAgentDebugEvent,
  type AgentDebugEvent,
} from "@zilobase/features/ai-chat";
import type { ChatStatus } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AgentDataPart = {
  data: unknown;
  type: string;
};

type ReceivedAgentDebugEvent = AgentDebugEvent & {
  receivedAt: number;
};

const MAX_DEBUG_EVENTS = 100;

export function useAgentLiveDebugger() {
  const [events, setEvents] = useState<ReceivedAgentDebugEvent[]>([]);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const seenEventIds = useRef(new Set<string>());
  const turnStartedAtRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (!import.meta.env.DEV) return;
    const startedAt = performance.now();
    seenEventIds.current.clear();
    turnStartedAtRef.current = startedAt;
    setEvents([]);
    setTurnStartedAt(startedAt);
  }, []);

  const onData = useCallback((part: AgentDataPart) => {
    if (
      !import.meta.env.DEV ||
      part.type !== "data-agent-debug" ||
      !isAgentDebugEvent(part.data)
    ) {
      return;
    }
    const event = part.data;
    if (seenEventIds.current.has(event.eventId)) return;
    seenEventIds.current.add(event.eventId);
    if (turnStartedAtRef.current === null) {
      turnStartedAtRef.current = performance.now();
      setTurnStartedAt(turnStartedAtRef.current);
    }
    setEvents((current) => [
      ...current.slice(-(MAX_DEBUG_EVENTS - 1)),
      { ...event, receivedAt: performance.now() },
    ]);
  }, []);

  return { events, onData, reset, turnStartedAt };
}

function eventText(event: ReceivedAgentDebugEvent) {
  switch (event.kind) {
    case "stream-open":
      return "Response stream opened";
    case "tool-input-start":
      return `Preparing ${event.toolName ?? "tool"} input`;
    case "tool-input-progress":
      return `Streaming ${event.toolName ?? "tool"} input`;
    case "tool-start":
      return `Executing ${event.toolName ?? "tool"}`;
    case "step-start":
      return event.label ? `Started: ${event.label}` : "Step started";
    case "step-finish":
      return event.label
        ? `${event.status === "failed" ? "Failed" : "Completed"}: ${event.label}`
        : "Step completed";
    case "row-progress":
      return `Rows ${event.completed ?? 0} / ${event.total ?? 0}`;
    case "effect":
      return `Applying live ${event.effectKind ?? "cache"} effect`;
    case "tool-finish":
      return `${event.status === "failed" ? "Failed" : "Finished"} ${event.toolName ?? "tool"}`;
  }
}

function formatElapsed(milliseconds: number) {
  if (milliseconds < 1000) return `+${Math.max(0, Math.round(milliseconds))}ms`;
  return `+${(milliseconds / 1000).toFixed(2)}s`;
}

export function AgentLiveDebugger({
  events,
  status,
  turnStartedAt,
}: {
  events: ReceivedAgentDebugEvent[];
  status: ChatStatus;
  turnStartedAt: number | null;
}) {
  const isActive = status === "submitted" || status === "streaming";
  const [open, setOpen] = useState(true);
  const [clock, setClock] = useState(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstReceivedAt = turnStartedAt ?? events[0]?.receivedAt ?? 0;
  const latestStatus = events.at(-1)?.status;
  const stateLabel = isActive
    ? events.length > 0
      ? "Live"
      : "Connecting"
    : status === "error" || latestStatus === "failed"
      ? "Failed"
      : "Complete";
  const visibleEvents = useMemo(() => events.slice(-50), [events]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (isActive) setOpen(true);
  }, [isActive]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (open) bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length, open]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!isActive || events.length > 0 || turnStartedAt === null) return;
    setClock(performance.now());
    const interval = window.setInterval(() => setClock(performance.now()), 100);
    return () => window.clearInterval(interval);
  }, [events.length, isActive, turnStartedAt]);

  if (!import.meta.env.DEV || (!isActive && events.length === 0)) return null;

  return (
    <div className="not-prose mb-3 overflow-hidden rounded-lg border bg-surface-canvas text-xs">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-action-neutral-hover"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${
            isActive
              ? "animate-pulse bg-action-selected"
              : stateLabel === "Failed"
                ? "bg-action-danger"
                : "bg-indicator-muted"
          }`}
        />
        <span className="font-medium text-content-primary">Live tool debugger</span>
        <span className="text-content-secondary">{stateLabel}</span>
        <span className="ml-auto text-content-secondary">
          {events.length} event{events.length === 1 ? "" : "s"} {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div
          aria-live="polite"
          className="max-h-56 overflow-y-auto border-t bg-surface-muted px-3 py-2 font-mono"
        >
          {visibleEvents.length === 0 ? (
            <div className="text-content-secondary">
              Waiting for the first streamed byte
              {turnStartedAt === null
                ? "…"
                : ` (${formatElapsed(clock - turnStartedAt).slice(1)})`}
              {turnStartedAt !== null && clock - turnStartedAt >= 3000
                ? " — the request or proxy is still buffering."
                : "…"}
            </div>
          ) : (
            visibleEvents.map((event) => (
              <div
                className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-0.5"
                key={event.eventId}
                title={event.toolCallId}
              >
                <span className="text-content-secondary opacity-70">
                  {formatElapsed(event.receivedAt - firstReceivedAt)}
                </span>
                <span
                  className={
                    event.status === "failed"
                      ? "text-action-danger-text"
                      : "text-content-secondary"
                  }
                >
                  {eventText(event)}
                  {event.detail ? ` — ${event.detail}` : ""}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      ) : null}
    </div>
  );
}
