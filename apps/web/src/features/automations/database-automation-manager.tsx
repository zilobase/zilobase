import { useAutomationManager, type Screen } from "./use-automation-manager";

import { AutomationBuilder } from "./definition/automation-builder";

import { Check, Loader2, X, Zap } from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";

import { Input } from "@/shared/ui/input";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

import { DatabaseViewToolbarButton } from "../databases/views/components/database-view-toolbar-button";

import {
  AutomationList,
  ManagerHeader,
  RunDetail,
  RunList,
} from "./database-automation-screens";

export function DatabaseAutomationManager({
  dataSourceId,
  databaseId,
  dataSourceName,
  open,
  onOpenChange,
  timezone,
}: {
  dataSourceId: string;
  databaseId: string;
  dataSourceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const {
    screen,
    setScreen,
    selectedAutomationId,
    setSelectedAutomationId,
    setSelectedRunId,
    draft,
    setDraft,
    confirmDiscard,
    setConfirmDiscard,
    list,
    catalog,
    detail,
    runs,
    run,
    startSlackOauth,
    lifecycle,
    validate,
    definition,
    generatedName,
    effectiveName,
    closeEditor,
    requestEditorClose,
    requestBack,
    startCreate,
    startEdit,
    save,
    saving,
    saveError,
  } = useAutomationManager({
    databaseId,
    dataSourceId,
    timezone,
    onOpenChange,
  });

  const trigger = (
    <DatabaseViewToolbarButton
      aria-label="Open database automations"
      aria-expanded={open}
    >
      <Zap />
    </DatabaseViewToolbarButton>
  );
  const menuPanel = (
    <>
      <ManagerHeader
        onBack={screen === "list" ? undefined : requestBack}
        title={screenTitle(screen, selectedAutomationId)}
      />
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {screen === "list" ? (
          <AutomationList
            data={list.data?.automations ?? []}
            error={list.isError}
            loading={list.isLoading}
            onCreate={startCreate}
            onEdit={startEdit}
            onLifecycle={(automationId, action) =>
              lifecycle.mutate({ automationId, action })
            }
            onRuns={(automationId) => {
              setSelectedAutomationId(automationId);
              setScreen("runs");
            }}
          />
        ) : screen === "runs" ? (
          <RunList
            loading={runs.isLoading}
            onSelect={(runId) => {
              setSelectedRunId(runId);
              setScreen("run");
            }}
            runs={runs.data?.runs ?? []}
          />
        ) : (
          <RunDetail loading={run.isLoading} run={run.data} />
        )}
      </div>
    </>
  );

  return (
    <>
      <DropDrawer
        defaultSubDisplayMode="inline"
        open={open}
        onOpenChange={onOpenChange}
      >
        <DropDrawerTrigger asChild>{trigger}</DropDrawerTrigger>
        <DropDrawerContent
          align="end"
          className="w-72 max-h-[min(36rem,calc(100dvh-1rem))] overflow-y-auto"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {menuPanel}
        </DropDrawerContent>
      </DropDrawer>
      <Dialog
        open={screen === "builder"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestEditorClose();
        }}
      >
        <DialogContent
          className="flex max-h-[min(680px,calc(100dvh-3rem))] w-[min(580px,calc(100vw-2rem))] max-w-[min(580px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(580px,calc(100vw-2rem))]"
          hideMobileDragHandle
          onOpenAutoFocus={(event) => event.preventDefault()}
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
            <DialogTitle className="sr-only">
              {selectedAutomationId ? "Edit automation" : "New automation"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure when this database automation runs and which actions it
              performs.
            </DialogDescription>
            <Input
              aria-label="Automation name"
              className="h-7 border-transparent bg-transparent px-0 font-heading text-sm font-medium focus-visible:px-2"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  customName: true,
                  name: event.target.value,
                })
              }
              placeholder={generatedName}
              value={draft.customName ? draft.name : generatedName}
            />
            <Button
              aria-label="Close automation editor"
              className="absolute right-3 top-3 text-content-secondary"
              onClick={requestEditorClose}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <AutomationBuilder
              catalog={catalog.data}
              databaseId={databaseId}
              dataSourceId={dataSourceId}
              dataSourceName={dataSourceName}
              draft={draft}
              loading={Boolean(selectedAutomationId && detail.isLoading)}
              onChange={setDraft}
              onConnectSlack={() =>
                void startSlackOauth
                  .mutateAsync()
                  .then(({ authorizationUrl }) =>
                    window.open(
                      authorizationUrl,
                      "_blank",
                      "noopener,noreferrer",
                    ),
                  )
              }
            />
          </div>
          <div className="shrink-0 border-t bg-surface-overlay px-4 py-2.5">
            {saveError ? (
              <p className="mb-2 text-xs text-action-danger-text" role="alert">
                {saveError instanceof Error
                  ? saveError.message
                  : "Could not save this automation."}
              </p>
            ) : null}
            {validate.data?.errors[0] ? (
              <p className="mb-2 text-xs text-action-danger-text" role="alert">
                {validate.data.errors[0].message}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={requestEditorClose}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={
                  !definition ||
                  !effectiveName ||
                  validate.data?.valid === false ||
                  saving
                }
                onClick={() => void save()}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                {selectedAutomationId ? "Save changes" : "Create and activate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard automation changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved trigger and action changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                closeEditor();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const screenTitle = (screen: Screen, editing: string | null) =>
  screen === "list"
    ? "Automations"
    : screen === "builder"
      ? editing
        ? "Edit automation"
        : "New automation"
      : screen === "runs"
        ? "Recent runs"
        : "Run details";
