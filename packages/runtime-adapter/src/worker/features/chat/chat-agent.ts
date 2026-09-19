import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import type { UIMessage } from "ai";
import {
  coerceAiChatRequestBody,
  loadAiChatThreadMessages,
  maybeAutoTitleAiChatThread,
  runAiChatTurn,
  runWithDbEnv,
  syncAiChatThreadMessages,
  touchAiChatThreadActivity,
  type AppBindings,
} from "@zilobase/server/adapter-api";
import { parseChatAgentInstanceName } from "./chat-agent-identity";

type ChatAgentEnv = Cloudflare.Env &
  Omit<AppBindings["Bindings"], "IMAGE_BUCKET"> & {
    IMAGE_BUCKET: R2Bucket;
  };

export class ChatAgent extends AIChatAgent<ChatAgentEnv> {
  override chatRecovery = true as const;
  maxPersistedMessages = 50;
  private canonicalMessagesPromise: Promise<UIMessage[]> | null = null;

  async persistMessages(
    messages: UIMessage[],
    excludeBroadcastIds: string[] = [],
    options?: { _deleteStaleRows?: boolean },
  ) {
    const mergedMessages = await this.mergeWithCanonicalMessages(messages);
    const threadId = this.threadId;

    if (threadId) {
      await this.withDb(async () => {
        await syncAiChatThreadMessages(threadId, mergedMessages, {
          deleteStaleRows: Boolean(options?._deleteStaleRows),
        });
      });
    }

    await super.persistMessages(mergedMessages, excludeBroadcastIds, options);
  }

  protected async onChatResponse(result: ChatResponseResult) {
    const threadId = this.threadId;

    if (!threadId || result.status !== "completed") {
      return;
    }

    await this.withDb(async () => {
      await touchAiChatThreadActivity(threadId);
      await maybeAutoTitleAiChatThread(threadId, this.messages);
    });
  }

  async onChatMessage(
    onFinish: Parameters<AIChatAgent<ChatAgentEnv>["onChatMessage"]>[0],
    options?: Parameters<AIChatAgent<ChatAgentEnv>["onChatMessage"]>[1],
  ) {
    const identity = this.identity;
    const requestBody = {
      ...coerceAiChatRequestBody(options?.body),
      threadId: identity?.threadId ?? null,
      userId: identity?.userId ?? null,
      workspaceId: identity?.workspaceId ?? null,
    };
    const threadId = identity?.threadId ?? null;

    if (!identity || !threadId) {
      return Response.json(
        { error: "Chat agent identity is invalid." },
        { status: 404 },
      );
    }

    const hydratedMessages = await this.mergeWithCanonicalMessages(this.messages);

    if (!haveSameMessageOrder(hydratedMessages, this.messages)) {
      await super.persistMessages(hydratedMessages, [], {
        _deleteStaleRows: true,
      });
    }

    return runAiChatTurn({
      abortSignal: options?.abortSignal,
      env: this.env as ChatAgentEnv & Record<string, unknown>,
      messages: this.messages,
      onStreamFinish: onFinish,
      persistOnFinish: false,
      requestBody,
      withDb: (fn) => this.withDb(fn),
    });
  }

  private withDb<T>(fn: () => Promise<T>) {
    return runWithDbEnv(
      this.env as ChatAgentEnv & Record<string, unknown>,
      fn,
    );
  }

  private mergeWithCanonicalMessages(messages: readonly UIMessage[]) {
    if (!this.threadId) return Promise.resolve([...messages]);

    this.canonicalMessagesPromise ??= this.withDb(() =>
      loadAiChatThreadMessages(this.threadId!),
    );

    return this.canonicalMessagesPromise.then((canonicalMessages) =>
      mergeCanonicalChatMessages(canonicalMessages, messages),
    );
  }

  private get identity() {
    return parseChatAgentInstanceName(this.name);
  }

  private get threadId() {
    return this.identity?.threadId ?? null;
  }
}

export function mergeCanonicalChatMessages(
  canonicalMessages: readonly UIMessage[],
  localMessages: readonly UIMessage[],
) {
  const merged = new Map(canonicalMessages.map((message) => [message.id, message]));

  for (const message of localMessages) {
    merged.set(message.id, message);
  }

  return [...merged.values()];
}

function haveSameMessageOrder(
  left: readonly UIMessage[],
  right: readonly UIMessage[],
) {
  return left.length === right.length && left.every(
    (message, index) => message.id === right[index]?.id,
  );
}
