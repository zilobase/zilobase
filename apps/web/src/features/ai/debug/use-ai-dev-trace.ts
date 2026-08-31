"use client";

import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import { useCallback, useEffect, useRef } from "react";

const TRACE_ENDPOINT = "/__zilobase_dev/ai-trace";
const MAX_PAYLOAD_CHARS = 100_000;
const FLUSH_DELAY_MS = 50;

type PendingTraceEvent = {
  occurredAt: string;
  payload: unknown;
  sequence: number;
  type: string;
};

export function useAiDevTrace(input: {
  threadId: string | null;
  workspaceId: string | null;
}) {
  const activeThreadIdRef = useRef(input.threadId);
  const eventsRef = useRef<PendingTraceEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const sessionIdRef = useRef(crypto.randomUUID());
  const workspaceIdRef = useRef(input.workspaceId);

  const flush = useCallback((useBeacon = false) => {
    if (!import.meta.env.DEV || eventsRef.current.length === 0) return;
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;

    const events = eventsRef.current.splice(0, 100);
    const body = JSON.stringify({
      events,
      sessionId: sessionIdRef.current,
      threadId,
      workspaceId: workspaceIdRef.current,
    });

    if (useBeacon && navigator.sendBeacon?.(TRACE_ENDPOINT, body)) return;

    void fetch(TRACE_ENDPOINT, {
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch((error) => {
      console.warn("AI development trace could not be written", error);
    });
  }, []);

  useEffect(() => {
    if (
      activeThreadIdRef.current &&
      activeThreadIdRef.current !== input.threadId
    ) {
      flush();
    }
    activeThreadIdRef.current = input.threadId;
    workspaceIdRef.current = input.workspaceId;
  }, [flush, input.threadId, input.workspaceId]);

  const record = useCallback((
    type: string,
    payload: unknown,
    threadId?: string | null,
  ) => {
    if (!import.meta.env.DEV) return;
    if (threadId && threadId !== activeThreadIdRef.current) {
      flush();
      activeThreadIdRef.current = threadId;
    }
    if (!activeThreadIdRef.current) return;

    eventsRef.current.push({
      occurredAt: new Date().toISOString(),
      payload: serializePayload(payload),
      sequence: ++sequenceRef.current,
      type,
    });
    if (eventsRef.current.length >= 25) {
      flush();
      return;
    }
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flush();
    }, FLUSH_DELAY_MS);
  }, [flush]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handlePageHide = () => flush(true);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      flush(true);
    };
  }, [flush]);

  return { record };
}

export function useAiDevMessageTrace(
  messages: UIMessage[],
  record: ReturnType<typeof useAiDevTrace>["record"],
) {
  const initializedRef = useRef(false);
  const observedPartsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      for (const message of messages) {
        message.parts.forEach((part, index) => {
          const key = `${message.id}:${index}`;
          if (part.type === "text") observedPartsRef.current.set(key, part.text);
          else if (isToolUIPart(part)) observedPartsRef.current.set(key, JSON.stringify(part));
        });
      }
      record("session-open", { messages });
      return;
    }

    for (const message of messages) {
      message.parts.forEach((part, index) => {
        const key = `${message.id}:${index}`;
        if (part.type === "text" && message.role === "assistant") {
          const previous = observedPartsRef.current.get(key) ?? "";
          if (part.text === previous) return;
          const delta = part.text.startsWith(previous)
            ? part.text.slice(previous.length)
            : part.text;
          observedPartsRef.current.set(key, part.text);
          record("assistant-text", {
            delta,
            messageId: message.id,
            replaced: !part.text.startsWith(previous),
          });
          return;
        }

        if (isToolUIPart(part)) {
          const snapshot = JSON.stringify(part);
          if (observedPartsRef.current.get(key) === snapshot) return;
          observedPartsRef.current.set(key, snapshot);
          record("tool-state", {
            errorText: "errorText" in part ? part.errorText : undefined,
            input: "input" in part ? part.input : undefined,
            output: "output" in part ? part.output : undefined,
            state: part.state,
            toolCallId: part.toolCallId,
            toolName: getToolName(part),
          });
        }
      });
    }
  }, [messages, record]);
}

function serializePayload(payload: unknown) {
  try {
    const serialized = JSON.stringify(payload, (_key, value) =>
      value instanceof Error
        ? { message: value.message, name: value.name, stack: value.stack }
        : value
    );
    if (serialized.length <= MAX_PAYLOAD_CHARS) return JSON.parse(serialized);
    return {
      preview: serialized.slice(0, MAX_PAYLOAD_CHARS),
      truncated: true,
    };
  } catch (error) {
    return {
      serializationError: error instanceof Error ? error.message : String(error),
    };
  }
}
