import { isToolUIPart, type ChatStatus, type UIMessage } from "ai";

export function shouldShowPendingAssistant(
  messages: UIMessage[],
  status: ChatStatus,
) {
  if (!(status === "submitted" || status === "streaming")) {
    return false;
  }

  const lastMessage = messages.at(-1);

  if (!lastMessage || lastMessage.role !== "assistant") {
    return true;
  }

  return !lastMessage.parts.some(
    (part) =>
      part.type === "text" ||
      part.type === "data-agent-progress" ||
      isToolUIPart(part),
  );
}
