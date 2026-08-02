import { Hash } from "lucide-react";

import type { DatabasePropertyConfig } from "../../../views/database-view-config";
import { PropertySettingSubmenu } from "../shared";

type FilesLimitValue = "one_file" | "no_limit";

const filesLimitOptions = [
  { label: "1 file", value: "one_file" },
  { label: "No limit", value: "no_limit" },
] satisfies { label: string; value: FilesLimitValue }[];

export function FilesPropertySettings({
  config,
  onUpdateConfig,
}: {
  config: Required<Pick<DatabasePropertyConfig, "filesLimit">>;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
}) {
  return (
    <PropertySettingSubmenu
      icon={<Hash />}
      label="Limit"
      onSelect={(filesLimit) => onUpdateConfig({ filesLimit })}
      options={filesLimitOptions}
      selectedValue={config.filesLimit}
    />
  );
}

export function getFilesPropertyConfig(config: unknown) {
  const parsedConfig =
    config && typeof config === "object"
      ? (config as DatabasePropertyConfig)
      : {};

  return {
    filesLimit: isFilesLimitValue(parsedConfig.filesLimit)
      ? parsedConfig.filesLimit
      : "no_limit",
  };
}

function isFilesLimitValue(value: unknown): value is FilesLimitValue {
  return value === "one_file" || value === "no_limit";
}
