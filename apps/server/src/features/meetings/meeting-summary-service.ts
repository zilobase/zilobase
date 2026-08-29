import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { resolveWorkspaceAiModel, type ResolvedAiModel } from "../../ai/ai-provider";
import { replaceMeetingSummary } from "../../collaboration/service";
import { getRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";
import { db } from "../../infrastructure/database";
import { meeting, meetingTranscriptSegment } from "../../infrastructure/database/schema";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import type { RuntimeEnv } from "../../shared/config/config";
import { getMeetingForUser } from "./meeting-service";

const MAX_TRANSCRIPT_CHUNK_CHARS = 60_000;

const summarySchema = z.object({
  actionItems: z.array(z.object({
    dueDate: z.string().nullable(),
    owner: z.string().nullable(),
    task: z.string().min(1),
  })),
  decisions: z.array(z.string()),
  highlights: z.array(z.string()),
  overview: z.string().min(1),
  title: z.string().min(1),
});

export type MeetingSummary = z.infer<typeof summarySchema>;

export async function generateMeetingSummary(input: {
  env: RuntimeEnv;
  meetingId: string;
  userId: string;
}) {
  const record = await getMeetingForUser(input.meetingId, input.userId, "edit");
  if (
    record.status === "recording" ||
    record.status === "paused" ||
    (record.recorderLeaseExpiresAt?.getTime() ?? 0) > Date.now()
  ) {
    throw new ServiceMutationError(
      "Stop the recording before generating a summary",
      409,
    );
  }
  const runtimeState = await getRuntimeAdapter().getMeetingRecorderSession?.({
    env: input.env,
    meetingId: record.id,
  });
  if (
    runtimeState &&
    ["claimed", "recording", "paused", "finishing"].includes(runtimeState.status)
  ) {
    throw new ServiceMutationError(
      "Wait for the recording transcript to finish before generating a summary",
      409,
    );
  }
  const segments = await db
    .select()
    .from(meetingTranscriptSegment)
    .where(
      and(
        eq(meetingTranscriptSegment.meetingId, record.id),
        eq(meetingTranscriptSegment.revision, record.transcriptRevision),
      ),
    )
    .orderBy(meetingTranscriptSegment.sequence);
  if (!segments.length) {
    throw new ServiceMutationError("A transcript is required to generate a summary", 409);
  }

  const transcript = segments
    .map((segment) => `[${formatOffset(segment.startMs)}] ${segment.text}`)
    .join("\n");
  const model = await resolveWorkspaceAiModel(
    record.workspaceId,
    undefined,
    input.env,
    "meeting-summary",
  );
  const instructions = record.customInstructions?.trim() ||
    presetInstructions(record.instructionsPreset);
  const chunks = splitTranscript(transcript);
  const source = chunks.length === 1
    ? chunks[0]
    : (await Promise.all(chunks.map(async (chunk, index) => {
        const partial = await requestSummary(
          model.model,
          chunk,
          `Create an intermediate factual summary for transcript part ${index + 1} of ${chunks.length}.`,
        );
        return JSON.stringify(partial);
      }))).join("\n");
  const summary = await requestSummary(
    model.model,
    source,
    `${instructions}\nWrite the output in meeting language: ${record.language}.`,
  );
  await replaceMeetingSummary({
    content: buildSummaryDocument(summary),
    env: input.env,
    meetingId: record.id,
    userId: input.userId,
  });

  const [updated] = await db
    .update(meeting)
    .set({
      status: record.status === "processing" ? "completed" : record.status,
      summaryGeneratedAt: new Date(),
      summarySourceSegmentCount: segments.length,
      updatedAt: new Date(),
    })
    .where(and(eq(meeting.id, record.id), isNull(meeting.deletedAt)))
    .returning();
  return { meeting: updated, summary };
}

async function requestSummary(
  model: ResolvedAiModel["model"],
  transcript: string,
  instructions: string,
) {
  const result = await generateText({
    model,
    output: Output.object({ schema: summarySchema }),
    prompt: `${instructions}\n\nTranscript:\n${transcript}`,
    system: "You summarize meetings faithfully. Do not invent decisions, owners, dates, or action items. Use concise plain language.",
  });
  if (!result.output) throw new Error("The summary model returned no structured output");
  return result.output;
}

export function buildSummaryDocument(summary: MeetingSummary) {
  const content: Array<Record<string, unknown>> = [
    heading(summary.title, 2),
    paragraph(summary.overview),
  ];
  appendList(content, "Highlights", summary.highlights);
  appendList(content, "Decisions", summary.decisions);
  appendList(
    content,
    "Action items",
    summary.actionItems.map((item) => {
      const metadata = [item.owner && `Owner: ${item.owner}`, item.dueDate && `Due: ${item.dueDate}`]
        .filter(Boolean)
        .join(" · ");
      return metadata ? `${item.task} — ${metadata}` : item.task;
    }),
  );
  return { content, type: "doc" };
}

export function splitTranscript(transcript: string) {
  if (transcript.length <= MAX_TRANSCRIPT_CHUNK_CHARS) return [transcript];
  const chunks: string[] = [];
  let remaining = transcript;
  while (remaining.length) {
    let end = Math.min(MAX_TRANSCRIPT_CHUNK_CHARS, remaining.length);
    const newline = remaining.lastIndexOf("\n", end);
    if (newline > MAX_TRANSCRIPT_CHUNK_CHARS / 2) end = newline + 1;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return chunks;
}

function heading(text: string, level: number) {
  return {
    attrs: { level },
    content: [{ text, type: "text" }],
    type: "heading",
  };
}

function paragraph(text: string) {
  return { content: [{ text, type: "text" }], type: "paragraph" };
}

function appendList(
  content: Array<Record<string, unknown>>,
  title: string,
  items: string[],
) {
  if (!items.length) return;
  content.push(heading(title, 3));
  content.push({
    content: items.map((item) => ({ content: [paragraph(item)], type: "listItem" })),
    type: "bulletList",
  });
}

function formatOffset(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function presetInstructions(preset: string) {
  if (preset === "sales") return "Emphasize objections, commitments, next steps, and account risks.";
  if (preset === "standup") return "Emphasize progress, blockers, owners, and immediate next steps.";
  if (preset === "interview") return "Emphasize questions, evidence, candidate responses, and follow-ups.";
  return "Summarize the discussion, decisions, and concrete action items.";
}
