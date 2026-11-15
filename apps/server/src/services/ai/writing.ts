import { aiWriteRequestSchema, unwrapMarkdownFence } from "@zilobase/features/runtime";
import { generateText, streamText, type LanguageModel } from "ai";
import type { z } from "zod";
import type { ServerOperationContext } from "../operations/context";
import { configuredChatModel } from "./chat";
import { authorizeChatWorkspace } from "./context";

const WRITING_INSTRUCTIONS = [
  "You write inside a Zilobase page for the signed-in user.",
  "Return only the new content in Markdown, with no preamble, explanation or code fences around the whole answer.",
  "When given a selection, return its replacement: keep its language (unless asked to translate), meaning, links and Markdown formatting unless the instruction says otherwise, and keep a single sentence or phrase inline rather than adding headings.",
  "When there is no selection, write new content that continues naturally from the surrounding text.",
  "Use Zilobase Markdown when it helps: headings, lists, task lists (- [ ]), tables, quotes, code, ':::callout 💡' … ':::' callouts and ':::toggle Title' … ':::' toggles.",
].join(" ");

/** One-shot writing for the editor's inline AI; the client previews and applies the result. */
export async function writeWithAi(
  context: ServerOperationContext,
  input: z.input<typeof aiWriteRequestSchema>,
  model: (context: ServerOperationContext) => LanguageModel = configuredChatModel,
  signal?: AbortSignal,
) {
  const request = aiWriteRequestSchema.parse(input);
  await authorizeChatWorkspace(context, request.workspaceId);
  const options = {
    model: model(context),
    system: WRITING_INSTRUCTIONS,
    prompt: writingPrompt(request),
    maxOutputTokens: 4_000,
    abortSignal: signal,
  };
  if (request.stream) return streamText(options).toTextStreamResponse();
  const result = await generateText(options);
  return { markdown: unwrapMarkdownFence(result.text) };
}

function writingPrompt(request: z.output<typeof aiWriteRequestSchema>) {
  return [
    request.context ? `<surrounding_text>\n${request.context}\n</surrounding_text>` : "",
    request.selection ? `<selection>\n${request.selection}\n</selection>` : "",
    `<instruction>\n${request.instruction}\n</instruction>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
