import type { UIMessage } from "ai";

export type AiChatThread = {
  id: string
  title: string
  pinned: boolean
  pinnedAt: string | null
  createdAt: string
  updatedAt: string
  lastActivityAt: string
}

export type AiChatFeedback = {
  messageId: string
  rating: -1 | 1
  reason: string | null
}

export type AiAgentPreference = {
  instructions: string
  responseStyle: "concise" | "balanced" | "detailed"
}

export type AiChatThreadsResponse = {
  threads: AiChatThread[]
}

export type AiChatThreadResponse = {
  thread: AiChatThread
}

export type AiChatThreadMessagesResponse = {
  feedback: AiChatFeedback[]
  messages: UIMessage[]
  thread: AiChatThread
}
