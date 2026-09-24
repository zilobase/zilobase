import type { useSettingsDraft } from "../use-settings-draft";
import { AgentSettingsPage } from "./agent-settings-page";
export function AiSettingsPanel({
  initialTab,
  onClose,
  draft,
}: {
  draft?: ReturnType<typeof useSettingsDraft>;
  initialTab?: string | null;
  onClose: () => void;
  onExpandPage?: (pageId: string) => void;
  showCloseButton?: boolean;
}) {
  return <AgentSettingsPage draft={draft} initialTab={initialTab} onClose={onClose} />;
}
