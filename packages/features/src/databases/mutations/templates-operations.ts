import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
import {
  buildTemplateCreate,
  buildTemplateState,
  buildTemplateUpdate,
  type DataSourceCommandScope,
} from "./command-builders";
import { resolveDataSourceCommandScope } from "./scope";
export type DatabaseStoredTemplate = {
  archivedAt: string | null;
  id: string;
  name: string;
  template: unknown;
};
export type DatabaseTemplateScope = {
  databaseId: string;
  hostDatabaseId?: string;
};

export type CreateDatabaseTemplateInput = DatabaseTemplateScope & {
  name: string;
  template: unknown;
};
export type CreateDatabaseTemplateResult = DatabaseStoredTemplate;
export function createDatabaseTemplate(
  context: ClientOperationContext,
  input: CreateDatabaseTemplateInput,
): Promise<CreateDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (scope, input: CreateDatabaseTemplateInput) =>
      buildTemplateCreate(scope, input),
    ),
  );
}

export type UpdateDatabaseTemplateInput = DatabaseTemplateScope & {
  patch: unknown;
  templateId: string;
};
export type UpdateDatabaseTemplateResult = DatabaseStoredTemplate;
export function updateDatabaseTemplate(
  context: ClientOperationContext,
  input: UpdateDatabaseTemplateInput,
): Promise<UpdateDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (scope, input: UpdateDatabaseTemplateInput) =>
      buildTemplateUpdate(scope, input),
    ),
  );
}

export type ArchiveDatabaseTemplateInput = DatabaseTemplateScope & {
  templateId: string;
};
export type ArchiveDatabaseTemplateResult = DatabaseStoredTemplate;
export function archiveDatabaseTemplate(
  context: ClientOperationContext,
  input: ArchiveDatabaseTemplateInput,
): Promise<ArchiveDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (scope, input: ArchiveDatabaseTemplateInput) =>
      buildTemplateState(scope, input.templateId, "template.archive"),
    ),
  );
}

export type RestoreDatabaseTemplateInput = DatabaseTemplateScope & {
  templateId: string;
};
export type RestoreDatabaseTemplateResult = DatabaseStoredTemplate;
export function restoreDatabaseTemplate(
  context: ClientOperationContext,
  input: RestoreDatabaseTemplateInput,
): Promise<RestoreDatabaseTemplateResult> {
  return runClientMutation(context, input, (context) =>
    databaseTemplateMutation(context, (scope, input: RestoreDatabaseTemplateInput) =>
      buildTemplateState(scope, input.templateId, "template.restore"),
    ),
  );
}

function databaseTemplateMutation<TInput extends DatabaseTemplateScope>(
  context: ClientOperationContext,
  build: (
    scope: DataSourceCommandScope,
    input: TInput,
  ) => Parameters<ReturnType<typeof clientDatabaseController>["execute"]>[0],
) {
  const controller = clientDatabaseController(context);
  const { queryClient } = context;
  return clientMutation({
    mutationFn: async (input: TInput) => {
      const scope = resolveDataSourceCommandScope(
        queryClient,
        controller.sessionId,
        input.databaseId,
        input.hostDatabaseId,
      );
      const ack = await controller.execute(build(scope, input));
      return ack.result as DatabaseStoredTemplate;
    },
  });
}
