import type { ChatReceiptStorage, ChatSubmission } from "@zilobase/features/ai";

// Only identifiers are stored; prompts, attachments, and answers stay on the server.
const prefix = "zilobase:ai-submission:";
export const webChatReceipts: ChatReceiptStorage = {
  clear: async (scope, requestId) => {
    try {
      const key = prefix + scope;
      const raw = sessionStorage.getItem(key);
      if (raw && JSON.parse(raw).requestId === requestId) sessionStorage.removeItem(key);
    } catch {
      /* Optional browser storage. */
    }
  },
  load: async (scope) => {
    try {
      const raw = sessionStorage.getItem(prefix + scope);
      if (!raw) return null;
      const value = JSON.parse(raw) as ChatSubmission;
      return typeof value.requestId === "string" &&
        typeof value.workspaceId === "string" &&
        typeof value.createdAt === "number"
        ? value
        : null;
    } catch {
      return null;
    }
  },
  write: async (scope, value) => {
    // Receipt persistence is optional (private browsing or storage quota may disable it).
    try {
      if (value) sessionStorage.setItem(prefix + scope, JSON.stringify(value));
      else sessionStorage.removeItem(prefix + scope);
    } catch {
      /* Thread discovery remains available without browser storage. */
    }
  },
};
