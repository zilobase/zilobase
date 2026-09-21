import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessage } from "ai";
import {
  buildChatAgentInstanceName,
  buildOwnedChatAgentRequest,
  haveSameChatMessageOrder,
  mergeCanonicalChatMessages,
  parseChatAgentInstanceName,
} from "./agent-room";

const identity = {
  threadId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  workspaceId: "workspace-1",
};

test("chat agent identity round trips through a runtime-neutral room name", () => {
  assert.deepEqual(
    parseChatAgentInstanceName(buildChatAgentInstanceName(identity)),
    identity,
  );
  assert.equal(parseChatAgentInstanceName("chat-not-ready"), null);
});

test("chat agent requests take ownership from the room identity", () => {
  assert.deepEqual(
    buildOwnedChatAgentRequest(buildChatAgentInstanceName(identity), {
      threadId: "attacker-thread",
      userId: "attacker",
      workspaceId: "attacker-workspace",
    }),
    identity,
  );
});

test("canonical messages keep their order while local messages win", () => {
  const canonical = [
    { id: "one", role: "user", parts: [] },
    { id: "two", role: "assistant", parts: [] },
  ] as UIMessage[];
  const local = [
    { id: "two", role: "assistant", parts: [{ type: "text", text: "new" }] },
    { id: "three", role: "user", parts: [] },
  ] as UIMessage[];

  const merged = mergeCanonicalChatMessages(canonical, local);
  assert.deepEqual(merged, [canonical[0], local[0], local[1]]);
  assert.equal(haveSameChatMessageOrder(merged, canonical), false);
  assert.equal(haveSameChatMessageOrder(canonical, [...canonical]), true);
});
