import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
  createOpenAI: vi.fn(),
  workspaceConfig: [] as unknown[],
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAI,
}));

vi.mock("../../../infrastructure/database", () => ({
  db: {
    select() {
      const builder = {
        from() { return builder; },
        where() { return builder; },
        async limit() { return mocks.workspaceConfig; },
      };
      return builder;
    },
  },
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
  mocks.workspaceConfig = [];
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
  const selected = await resolveWorkspaceAiModel(
    "workspace-1",
    "openai:gpt-4o",
    { OPENAI_API_KEY: "key" },
  );
  assert.equal(selected.catalog.id, "gpt-4o");
  assert.deepEqual(selected.model, { modelId: "gpt-4o" });
  assert.equal(selected.credentialSource, "managed");

  const automatic = await resolveWorkspaceAiModel(
    "workspace-1",
    "auto",
    { OPENAI_API_KEY: "key" },
  );
  assert.equal(automatic.catalog.id, DEFAULT_OPENAI_CHAT_MODEL);
  assert.deepEqual(automatic.model, { modelId: DEFAULT_OPENAI_CHAT_MODEL });
});

test("resolveWorkspaceAiModel rejects models outside the server catalog", async () => {
  await assert.rejects(
    () => resolveWorkspaceAiModel(
      "workspace-1",
      "openai:gpt-5-unlisted",
      { OPENAI_API_KEY: "key" },
    ),
    (error: unknown) =>
      error instanceof AiProviderConfigError && error.status === 400,
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
