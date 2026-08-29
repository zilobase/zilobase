import { ArrowLeftRight } from "@/shared/components/icons";

import { DropDrawerItem } from "@/shared/ui/dropdrawer";
import { Switch } from "@/shared/ui/switch";

import type { DatabasePropertyConfig } from "../../../views/model/database-view-config";

export function UrlPropertySettings({
  onUpdateConfig,
  showFullUrl,
}: {
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  showFullUrl: boolean;
}) {
  return (
    <DropDrawerItem
      aria-pressed={showFullUrl}
      onSelect={(event) => {
        event.preventDefault();
        onUpdateConfig({ showFullUrl: !showFullUrl });
      }}
    >
      <ArrowLeftRight />
      <span>Show full URL</span>
      <Switch
        checked={showFullUrl}
        className="ml-auto pointer-events-none"
        size="sm"
        tabIndex={-1}
      />
    </DropDrawerItem>
  );
}
