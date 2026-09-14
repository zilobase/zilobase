import { Eye, Plus } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";

import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../state/database-view-context";

import { DatabaseFormShareMenu } from "../form/components/database-form-share-menu";

export function DatabaseRowCreationControl({
  onPreviewForm,
}: {
  onPreviewForm: () => void;
}) {
  const { canAddDatabaseRows, editable } = useDatabaseDataContext();
  const { activeView, activeViewTabId, viewTabs } = useDatabaseUiContext();
  const canRenderAddRow = canAddDatabaseRows ?? editable;
  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId);
  const isFormView = (activeView?.type ?? activeViewTab?.type) === "form";
  return isFormView ? (
    <div className="ml-2 flex items-center gap-2">
      <Button
        aria-label="Preview form"
        className="h-7 gap-1.5 px-3"
        onClick={() => onPreviewForm()}
        type="button"
        variant="outline"
      >
        <Eye />
        <span>Preview</span>
      </Button>
      <DatabaseFormShareMenu />
    </div>
  ) : canRenderAddRow ? (
    <NewDatabaseRowButton />
  ) : null;
}

function NewDatabaseRowButton() {
  const { addDatabaseRow } = useDatabaseActionsContext();
  const { databaseId } = useDatabaseDataContext();
  const { newRowLabel } = useDatabaseUiContext();
  return (
    <Button
      aria-label={newRowLabel ?? "New page"}
      className="database-new-button"
      disabled={!databaseId}
      onClick={() => addDatabaseRow()}
      type="button"
    >
      <Plus />
      <span>{newRowLabel ?? "New"}</span>
    </Button>
  );
}
