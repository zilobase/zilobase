import { compileDatabaseAutomationDefinition } from "./compiler";
import { loadCompilationContext, requireManagementContext } from "./service-support";

export async function validateDatabaseAutomation(input: {
  allowHttpWebhookDomains?: Set<string>;
  databaseId: string;
  dataSourceId: string;
  definition: unknown;
  gmailEnabled?: boolean;
  slackEnabled?: boolean;
  webhooksEnabled?: boolean;
  userId: string;
}) {
  const management = await requireManagementContext(input);
  const compilationContext = await loadCompilationContext({
    allowHttpWebhookDomains: input.allowHttpWebhookDomains,
    databaseId: input.databaseId,
    definition: input.definition,
    gmailEnabled: input.gmailEnabled,
    slackEnabled: input.slackEnabled,
    webhooksEnabled: input.webhooksEnabled,
    management,
    userId: input.userId,
  });
  return compileDatabaseAutomationDefinition(input.definition, compilationContext).validation;
}
