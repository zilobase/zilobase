import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  createOpenAI: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAI,
}));

import {
  AiProviderConfigError,
  DEFAULT_OPENAI_CHAT_MODEL,
  resolveOpenAiChatModel,
  resolveWorkspaceAiModel,
} from "./ai-provider";

beforeEach(() => {
  mocks.chat.mockReset();
  mocks.chat.mockImplementation((modelId: string) => ({ modelId }));
  mocks.createOpenAI.mockReset();
  mocks.createOpenAI.mockReturnValue({ chat: mocks.chat });
});

test("resolveOpenAiChatModel normalizes bearer keys and defaults the model", () => {
  const model = resolveOpenAiChatModel("  Bearer secret-key  ");
  assert.deepEqual(model, { modelId: DEFAULT_OPENAI_CHAT_MODEL });
  assert.deepEqual(mocks.createOpenAI.mock.calls[0]?.[0], {
    apiKey: "secret-key",
  });
});

test("resolveOpenAiChatModel accepts provider-prefixed model identifiers", () => {
  const model = resolveOpenAiChatModel("secret", "openai:gpt-5-mini");
  assert.deepEqual(model, { modelId: "gpt-5-mini" });
});

test("resolveWorkspaceAiModel delegates selected and default models", async () => {
  assert.deepEqual(
    await resolveWorkspaceAiModel("workspace-1", "openai:gpt-5", "key"),
    { modelId: "gpt-5" },
  );
  assert.deepEqual(
    await resolveWorkspaceAiModel("workspace-1", undefined, "key"),
    { modelId: DEFAULT_OPENAI_CHAT_MODEL },
  );
});

test("AI model resolution rejects missing credentials", () => {
  assert.throws(
    () => resolveOpenAiChatModel(" Bearer  ", "gpt-5"),
    (error: unknown) =>
      error instanceof AiProviderConfigError &&
      error.status === 503 &&
      error.name === "AiProviderConfigError",
  );
});
