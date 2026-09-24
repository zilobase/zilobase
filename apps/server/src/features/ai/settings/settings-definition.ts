import {
  settingsDefinitionSchema,
  type AgentSettingsDefinition,
} from "@zilobase/features/ai-chat/settings-contract";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";

import { markdownToPageContent } from "../conversion/markdown-to-page-content";

export function mergeSettingsPatch(
  current: AgentSettingsDefinition,
  patch: Partial<AgentSettingsDefinition>,
) {
  const next = settingsDefinitionSchema.parse({ ...current, ...patch });
  if (patch.instructionDocument)
    next.instructions = prosemirrorToMarkdown(patch.instructionDocument);
  else if (patch.instructions !== undefined)
    next.instructionDocument = markdownToPageContent(patch.instructions);
  return settingsDefinitionSchema.parse(next);
}

export function sameSettings(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string =>
    Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : value && typeof value === "object"
        ? `{${Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(",")}}`
        : (JSON.stringify(value) ?? "null");
  return canonical(a) === canonical(b);
}
