const ZILOBASE_AI_MODES = new Set(["instruction", "skill"] as const);

export type ZilobaseAiMode = "instruction" | "skill";

export function parseZilobaseAiModes(
  value: string | undefined,
): ZilobaseAiMode[] | null {
  if (!value) return null;

  const modes = value
    .split(",")
    .map((mode) => mode.trim())
    .filter((mode): mode is ZilobaseAiMode =>
      ZILOBASE_AI_MODES.has(mode as ZilobaseAiMode),
    );

  return modes.length > 0 ? [...new Set(modes)] : null;
}

export function readZilobaseAiMode(
  metadata: unknown,
): ZilobaseAiMode | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const mode = (metadata as { zilobaseai?: unknown }).zilobaseai;
  return typeof mode === "string" && ZILOBASE_AI_MODES.has(mode as ZilobaseAiMode)
    ? (mode as ZilobaseAiMode)
    : null;
}

export function readPageEmoji(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const emoji = (metadata as { emoji?: unknown }).emoji;
  return typeof emoji === "string" ? emoji : null;
}

export function toZilobaseAiPageSummary(record: {
  id: string;
  metadata: unknown;
  name: string;
  updatedAt: Date;
  url: string;
  workspaceId: string;
}) {
  return {
    id: record.id,
    name: record.name,
    workspaceId: record.workspaceId,
    updatedAt: record.updatedAt,
    url: record.url,
    metadata: {
      emoji: readPageEmoji(record.metadata),
      zilobaseai: readZilobaseAiMode(record.metadata),
    },
  };
}
