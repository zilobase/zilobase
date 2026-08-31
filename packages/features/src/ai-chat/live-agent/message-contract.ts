import type { UIMessage } from "ai";

import type { AgentDebugEvent } from "./debug-contract";
import type { AgentLiveEffect } from "./effect-contract";
import type { AgentProgressSnapshot } from "./progress-contract";

export type ZilobaseChatData = {
  "agent-debug": AgentDebugEvent;
  "agent-effect": AgentLiveEffect;
  "agent-progress": AgentProgressSnapshot;
};

export type ZilobaseChatMessage = UIMessage<unknown, ZilobaseChatData>;

export function isAgentProgressPart(
  part: UIMessage["parts"][number],
): part is { type: "data-agent-progress"; data: AgentProgressSnapshot } {
  return part.type === "data-agent-progress";
}
