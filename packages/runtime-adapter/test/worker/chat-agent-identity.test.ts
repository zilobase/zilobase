import { describe, expect, it } from "vitest";

import {
  buildChatAgentInstanceName,
  parseChatAgentInstanceName,
} from "@zilobase/features/ai-chat/agent-room";

const identity = {
  threadId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  workspaceId: "workspace-1",
};

describe("private chat agent identity", () => {
  it("round trips ownership through the instance name", () => {
    expect(parseChatAgentInstanceName(buildChatAgentInstanceName(identity)))
      .toEqual(identity);
  });

  it("rejects malformed instance names", () => {
    expect(parseChatAgentInstanceName("chat-not-ready")).toBeNull();
    expect(parseChatAgentInstanceName("org-a-user-b-thread-invalid")).toBeNull();
  });
});
