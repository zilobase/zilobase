import {
  type BuilderDraft,
  emptyDraft,
  buildDefinition,
  generateName,
  draftFromDefinition,
} from "./definition/automation-draft";

import { useEffect, useMemo, useState } from "react";
import {
  useCreateDatabaseAutomation,
  useCreateDatabaseAutomationSecret,
  useDatabaseAutomation,
  useDatabaseAutomationCatalog,
  useDatabaseAutomationLifecycle,
  useDatabaseAutomationRun,
  useDatabaseAutomationRuns,
  useDatabaseAutomations,
  useStartSlackAutomationOauth,
  useUpdateDatabaseAutomation,
  useValidateDatabaseAutomation,
} from "@zilobase/features/automations/react";

import { materializeWebhookSecrets } from "./definition/materialize-webhook-secrets";

export type Screen = "builder" | "list" | "run" | "runs";

export function useAutomationManager({
  databaseId,
  dataSourceId,
  timezone,
  onOpenChange,
}: {
  databaseId: string;
  dataSourceId: string;
  timezone: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>("list");
  const [selectedAutomationId, setSelectedAutomationId] = useState<
    string | null
  >(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BuilderDraft>(() => emptyDraft());
  const [baseline, setBaseline] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const automationId = selectedAutomationId ?? "";
  const list = useDatabaseAutomations(databaseId, dataSourceId);
  const catalog = useDatabaseAutomationCatalog(databaseId, dataSourceId);
  const detail = useDatabaseAutomation(databaseId, automationId);
  const runs = useDatabaseAutomationRuns(databaseId, automationId);
  const run = useDatabaseAutomationRun(
    databaseId,
    automationId,
    selectedRunId ?? "",
  );
  const create = useCreateDatabaseAutomation(databaseId, dataSourceId);
  const createSecret = useCreateDatabaseAutomationSecret(
    databaseId,
    dataSourceId,
  );
  const startSlackOauth = useStartSlackAutomationOauth(
    databaseId,
    dataSourceId,
  );
  const update = useUpdateDatabaseAutomation(databaseId, automationId);
  const lifecycle = useDatabaseAutomationLifecycle(databaseId, dataSourceId);
  const validate = useValidateDatabaseAutomation(databaseId);
  const definition = useMemo(
    () => buildDefinition(draft, timezone, catalog.data),
    [catalog.data, draft, timezone],
  );
  const generatedName = generateName(draft, catalog.data);
  const dirty = screen === "builder" && JSON.stringify(draft) !== baseline;
  const effectiveName = draft.customName ? draft.name.trim() : generatedName;
  useEffect(() => {
    if (!definition || screen !== "builder") return;
    const timeout = window.setTimeout(() => {
      validate.mutate({ dataSourceId, definition });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [dataSourceId, definition, screen]);
  useEffect(() => {
    if (screen !== "builder" || !selectedAutomationId || !detail.data) return;
    const next = draftFromDefinition(detail.data.name, detail.data.definition);
    setDraft(next);
    setBaseline(JSON.stringify(next));
  }, [catalog.data, dataSourceId, detail.data, screen, selectedAutomationId]);
  const closeEditor = () => {
    setScreen("list");
    setSelectedAutomationId(null);
  };
  const requestEditorClose = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  };
  const requestBack = () => {
    setScreen(screen === "run" ? "runs" : "list");
  };
  const startCreate = () => {
    const next = emptyDraft();
    setSelectedAutomationId(null);
    setDraft(next);
    setBaseline(JSON.stringify(next));
    setScreen("builder");
    onOpenChange(false);
  };
  const startEdit = (automationId: string) => {
    setSelectedAutomationId(automationId);
    setBaseline("");
    setScreen("builder");
    onOpenChange(false);
  };
  const save = async () => {
    if (!definition || !effectiveName) return;
    const saveDraft = await materializeWebhookSecrets(
      draft,
      createSecret.mutateAsync,
    );
    const savedDefinition = buildDefinition(saveDraft, timezone, catalog.data);
    if (!savedDefinition) return;
    if (selectedAutomationId && detail.data) {
      await update.mutateAsync({
        body: { definition: savedDefinition, name: effectiveName },
        version: detail.data.version,
      });
    } else {
      await create.mutateAsync({
        definition: savedDefinition,
        name: effectiveName,
      });
    }
    setDraft(saveDraft);
    setBaseline(JSON.stringify(saveDraft));
    setScreen("list");
  };

  const saving = create.isPending || update.isPending || createSecret.isPending;
  const saveError = create.error ?? update.error ?? createSecret.error;
  return {
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
  };
}
