import {
  getToolbarSourceIdentity,
  getToolbarSourceTitle,
} from "../model/toolbar-source";
import { DatabaseSettingsControl } from "./database-settings-control";
import { DatabaseRowCreationControl } from "./database-row-creation-control";
import { DatabaseSortControl } from "./database-sort-control";
import { DatabaseFilterControl } from "./database-filter-control";
import { DatabaseSaveStatus } from "./database-save-status";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Maximize2 } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";

import {
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../state/database-view-context";

import { DatabaseAutomationManager } from "../../../automations";
import { useDatabaseAutomationCapability } from "@zilobase/features/automations/react";
import { DatabaseTrashRestoreButton } from "../../core/database-trash-restore-button";

export function DatabaseToolbarActions({
  canRestoreDeleted,
  deletedDatabaseId,
  onPreviewForm,
  settingsOpen,
  onSettingsOpenChange,
}: {
  canRestoreDeleted: boolean;
  deletedDatabaseId: string | null;
  onPreviewForm: () => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}) {
  const {
    databaseId,
    databaseWorkspaceId,
    editable,
    hostDatabaseId,
    hostDatabaseName,
    hostDatabaseWorkspaceId,
    workspaceId,
  } = useDatabaseDataContext();
  const { activeViewTabId, draftDatabaseTitle, showExpandButton, viewTabs } =
    useDatabaseUiContext();

  const [automationManagerOpen, setAutomationManagerOpen] = useState(false);

  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId);
  const {
    databaseId: automationDatabaseId,
    workspaceId: automationWorkspaceId = "",
    expandDatabaseId,
  } = getToolbarSourceIdentity({
    hostDatabaseId,
    databaseId,
    hostDatabaseWorkspaceId,
    databaseWorkspaceId,
    workspaceId,
  });
  const automationDataSourceId = activeViewTab?.dataSourceId ?? "";
  const automationsEnabled = useAutomationsEnabled(
    automationDatabaseId,
    automationWorkspaceId,
  );
  const sourceHost = {
    hostDatabaseId,
    databaseId,
    hostDatabaseName,
    hostDatabaseWorkspaceId,
    databaseWorkspaceId,
    workspaceId,
  };
  const hostDisplayTitle = getToolbarSourceTitle(
    sourceHost,
    activeViewTab,
    draftDatabaseTitle,
  );

  return (
    <div
      className="ml-auto flex shrink-0 items-center gap-0"
      data-page-side-pane-avoid
    >
      {editable ? (
        <>
          <DatabaseSaveStatus databaseId={automationDatabaseId} />
          <DatabaseFilterControl />
          <DatabaseSortControl />
          <ToolbarAutomationManager
            enabled={automationsEnabled}
            databaseId={automationDatabaseId}
            dataSourceId={automationDataSourceId}
            name={activeViewTab?.dataSourceName ?? hostDisplayTitle}
            open={automationManagerOpen}
            onOpenChange={setAutomationManagerOpen}
          />
          <DatabaseSettingsControl
            open={settingsOpen}
            onOpenChange={onSettingsOpenChange}
            onOpenAutomations={
              automationsEnabled
                ? () => setAutomationManagerOpen(true)
                : undefined
            }
          />
          <DatabaseRowCreationControl onPreviewForm={onPreviewForm} />
        </>
      ) : canRestoreDeleted && deletedDatabaseId ? (
        <DatabaseTrashRestoreButton databaseId={deletedDatabaseId} />
      ) : null}
      {showExpandButton && expandDatabaseId ? (
        <Button
          aria-label="Expand database"
          asChild
          className="database-expand-button"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Link
            params={{ databaseId: expandDatabaseId }}
            search={{ view: undefined }}
            title="Expand database"
            to="/d/$databaseId"
          >
            <Maximize2 />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function useAutomationsEnabled(
  automationDatabaseId: string,
  automationWorkspaceId: string,
) {
  const automationUiAvailable = import.meta.env.DEV;
  const automationCapability = useDatabaseAutomationCapability(
    automationUiAvailable ? automationDatabaseId : null,
    automationUiAvailable ? automationWorkspaceId : null,
  );
  const automationsEnabled =
    automationUiAvailable && automationCapability.data?.enabled === true;
  return automationsEnabled;
}

function ToolbarAutomationManager({
  enabled,
  databaseId,
  dataSourceId,
  name,
  open,
  onOpenChange,
}: {
  enabled: boolean;
  databaseId: string;
  dataSourceId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!enabled || !databaseId || !dataSourceId) return null;
  return (
    <DatabaseAutomationManager
      databaseId={databaseId}
      dataSourceId={dataSourceId}
      dataSourceName={name}
      open={open}
      onOpenChange={onOpenChange}
      timezone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
    />
  );
}
