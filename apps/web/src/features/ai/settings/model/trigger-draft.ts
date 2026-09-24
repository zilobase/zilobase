import type { AgentSettingsDefinition } from "@zilobase/features/ai-chat";

type Trigger = AgentSettingsDefinition["triggers"][number];
type TriggerDraft = {
  kind: string;
  cadence: string;
  databaseEvent: string;
  propertyId: string;
  target: string;
  label: string;
  editingId: string | null;
};

export function canSaveSettingsTrigger(draft: TriggerDraft) {
  if (!draft.label.trim()) return false;
  if (draft.kind === "webhook") return true;
  if (draft.kind === "schedule") return draft.cadence !== "custom" || validInterval(draft.target);
  return Boolean(draft.target.trim());
}

function validInterval(target: string) {
  return Number.isFinite(Number(target)) && Number(target) >= 5;
}

function triggerConfiguration(draft: TriggerDraft) {
  switch (draft.kind) {
    case "schedule":
      return {
        cadence: draft.cadence,
        ...(draft.cadence === "custom" ? { intervalMinutes: Number(draft.target) } : {}),
      };
    case "database":
      return {
        databaseId: draft.target,
        event: draft.databaseEvent,
        ...(draft.propertyId ? { propertyId: draft.propertyId } : {}),
      };
    case "meeting":
      return { meetingId: draft.target };
    case "webhook":
      return {};
    default:
      return { pageId: draft.target };
  }
}

export function applySettingsTriggerDraft(
  triggers: Trigger[],
  draft: TriggerDraft,
  id: string,
): Trigger[] {
  return [
    ...triggers.filter((trigger) => trigger.id !== draft.editingId),
    {
      id,
      kind: draft.kind as Trigger["kind"],
      label: draft.label,
      config: triggerConfiguration(draft),
      status:
        triggers.find((trigger) => trigger.id === draft.editingId)?.status ??
        (draft.kind === "webhook" ? "paused" : "active"),
    },
  ];
}

export function settingsTriggerTargetInput(kind: string, cadence: string) {
  if (kind === "webhook") return null;
  if (kind === "schedule")
    return cadence === "custom"
      ? {
          label: "Interval in minutes",
          placeholder: "Interval in minutes (minimum 5)",
        }
      : null;
  return { label: "Resource ID", placeholder: "Resource ID" };
}
