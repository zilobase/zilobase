import type { ReactNode } from "react";

import {
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";

import {
  hasDatabasePropertyTypeEditSettings,
  isDateLikePropertyType,
  isSelectLikePropertyType,
} from "../../core/database-property-types";
import { getNumberPropertyConfig, NumberPropertySettings } from "./number";
import {
  getDateFormatConfig,
  getTimeFormatConfig,
} from "../model/database-date-config";
import {
  getShowFullUrl,
  getStatusDefaultOptionId,
  type DatabasePropertyConfig,
} from "../../views/model/database-view-config";
import { useDatabaseViewContext } from "../../views/model/database-view-context";
import { DatePropertySettings } from "./date";
import { FilesPropertySettings, getFilesPropertyConfig } from "./files";
import { getPersonPropertyConfig, PersonPropertySettings } from "./person";
import { RelationPropertySettings } from "./relation";
import { DatabaseRollupPropertySettings } from "./rollup";
import {
  getSelectOptions,
  getSelectOptionSort,
  SelectPropertySettings,
} from "./select";
import { getStatusOptions, StatusPropertySettings } from "./status";
import { UrlPropertySettings } from "./url";

type PropertySettingsProps = {
  config?: unknown;
  databaseId: string;
  databasePropertyId: string;
  sourceDatabaseId?: string;
  sourceDatabaseName?: string;
  sourcePropertyId?: string;
  type: string;
  workspaceId?: string | null;
};

export function DatabasePropertyEditSubmenu({
  children,
  displayMode = "nested",
  title = "Edit property",
  ...settingsProps
}: PropertySettingsProps & {
  children: ReactNode;
  displayMode?: "inline" | "nested";
  title?: string;
}) {
  return (
    <DropDrawerSub displayMode={displayMode} title={title}>
      <DropDrawerSubTrigger>{children}</DropDrawerSubTrigger>
      <DropDrawerSubContent
        className={getPropertySettingsContentClassName(settingsProps.type)}
      >
        <DatabasePropertySettings {...settingsProps} />
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

export function hasDatabasePropertyEditSettings(type: string) {
  return hasDatabasePropertyTypeEditSettings(type);
}

function DatabasePropertySettings({
  config,
  databaseId,
  databasePropertyId,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  type,
  workspaceId,
}: PropertySettingsProps) {
  const { updateDatabasePropertyConfig } = useDatabaseViewContext();
  const updatePropertyConfig = (nextConfig: DatabasePropertyConfig) => {
    void updateDatabasePropertyConfig(databasePropertyId, nextConfig);
  };

  if (type === "number") {
    return (
      <NumberPropertySettings
        config={getNumberPropertyConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    );
  }

  if (type === "url") {
    return (
      <UrlPropertySettings
        onUpdateConfig={updatePropertyConfig}
        showFullUrl={getShowFullUrl(config)}
      />
    );
  }

  if (type === "status") {
    return (
      <StatusPropertySettings
        defaultOptionId={getStatusDefaultOptionId(config)}
        onUpdateConfig={updatePropertyConfig}
        options={getStatusOptions(config)}
      />
    );
  }

  if (isSelectLikePropertyType(type)) {
    return (
      <SelectPropertySettings
        onUpdateConfig={updatePropertyConfig}
        options={getSelectOptions(config)}
        sort={getSelectOptionSort(config)}
      />
    );
  }

  if (type === "person") {
    return (
      <PersonPropertySettings
        config={getPersonPropertyConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    );
  }

  if (type === "files") {
    return (
      <FilesPropertySettings
        config={getFilesPropertyConfig(config)}
        onUpdateConfig={updatePropertyConfig}
      />
    );
  }

  if (type === "relation") {
    return (
      <RelationPropertySettings
        config={config}
        databaseId={databaseId}
        databasePropertyId={databasePropertyId}
        onUpdateConfig={updatePropertyConfig}
        sourceDatabaseId={sourceDatabaseId ?? databaseId}
        sourceDatabaseName={sourceDatabaseName}
        sourcePropertyId={sourcePropertyId}
        workspaceId={workspaceId}
      />
    );
  }

  if (type === "rollup") {
    return (
      <DatabaseRollupPropertySettings
        config={config}
        databaseId={databaseId}
        onUpdateConfig={updatePropertyConfig}
      />
    );
  }

  if (isDateLikePropertyType(type)) {
    return (
      <DatePropertySettings
        dateFormat={getDateFormatConfig(config)}
        onUpdateConfig={updatePropertyConfig}
        timeFormat={getTimeFormatConfig(config)}
      />
    );
  }

  return <DropDrawerItem disabled>Property settings</DropDrawerItem>;
}

function getPropertySettingsContentClassName(type: string) {
  return type === "number" ||
    type === "status" ||
    isSelectLikePropertyType(type) ||
    type === "person" ||
    type === "files" ||
    type === "relation" ||
    type === "rollup" ||
    isDateLikePropertyType(type)
    ? "w-80"
    : undefined;
}

export { DatabaseRollupPropertySettings } from "./rollup";
