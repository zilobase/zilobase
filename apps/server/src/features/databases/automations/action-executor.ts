import { eq } from "drizzle-orm";
import { type DatabaseAutomationAction } from "@zilobase/features/databases/automations";
import { type FormulaValue } from "@zilobase/features/databases/formula";
import { type RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { databaseRow } from "../../../infrastructure/database/schema";
import { getEffectivePageAccessForUsers } from "../../access";
import { createDatabaseRowService } from "../rows/service";
import { applyDatabaseAutomationRowOperations } from "./internal-mutations";
import { accessibleNotificationPageId, activeNotificationRecipientIds, createAutomationNotifications } from "../../notifications/service";
import { AutomationActionError } from "./action-error";
import { type ExecutionContext } from "./execution-context";
import { resolveRichText, scalarString, userIds, resolveExpression, resolveOperations, resolveEditTarget, requireTriggerRow, assertBoundedValue, stableActionSuffix, requireOwner, stringList } from "./action-support";
import { executeWebhookAction } from "./webhook-action";
import { executeSlackAction } from "./slack-action";
import { executeGmailAction } from "./gmail-action";
export async function executeAction(
  context: ExecutionContext,
  action: DatabaseAutomationAction,
  env: RuntimeEnv,
): Promise<Record<string, unknown>> {
  const actorId = requireOwner(context.automation.ownerUserId);
  if (action.type === "define_variables") {
    const variables: Record<string, FormulaValue> = {};
    for (const variable of action.variables) {
      const value = resolveExpression(context, variable.expression);
      assertBoundedValue(value);
      variables[variable.name] = value as FormulaValue;
      context.variables[variable.name] = value as FormulaValue;
    }
    return { variables };
  }
  if (action.type === "edit_trigger_page") {
    const row = requireTriggerRow(context);
    const operations = resolveOperations(context, action.operations);
    await applyDatabaseAutomationRowOperations({
      actorId,
      dataSourceId: context.run.dataSourceId,
      env,
      operations,
      rows: [{ pageId: row.pageId, rowId: row.id }],
      runId: context.run.id,
    });
    return { editedRows: 1 };
  }
  if (action.type === "add_page") {
    const operations = resolveOperations(context, action.operations);
    const titleOperation = operations.find((operation) => operation.propertyId === "name");
    const suffix = stableActionSuffix(context.run.id, action.id);
    const existing = await db
      .select({ pageId: databaseRow.pageId })
      .from(databaseRow)
      .where(eq(databaseRow.id, `automation-row:${suffix}`))
      .limit(1);
    if (existing[0]) return { pageId: existing[0].pageId, rowId: `automation-row:${suffix}` };
    const created = await createDatabaseRowService({
      automationRunId: context.run.id,
      databaseId: action.dataSourceId,
      env,
      initialValues: operations
        .filter((operation) => operation.propertyId !== "name")
        .map((operation) => ({
          propertyId: operation.propertyId,
          value: operation.mode === "clear" || operation.mode === "remove" ? null : operation.value,
        })),
      newPageId: `automation-page:${suffix}`,
      newRowId: `automation-row:${suffix}`,
      origin: "automation",
      title: titleOperation?.mode === "clear"
        ? "Untitled"
        : String(titleOperation?.value ?? "").trim() || "Untitled",
      userId: actorId,
    });
    return { pageId: created.rowPageId, rowId: created.rowId };
  }
  if (action.type === "edit_pages") {
    const target = await resolveEditTarget(context, action);
    await applyDatabaseAutomationRowOperations({
      actorId,
      dataSourceId: target.dataSourceId,
      env,
      operations: resolveOperations(context, action.operations),
      rows: target.rows,
      runId: context.run.id,
    });
    return { editedRows: target.rows.length };
  }
  if (action.type === "send_notification") {
    const candidates = action.recipients.flatMap((recipient) => {
      if (recipient.type === "selected_user") return [recipient.userId];
      if (recipient.type === "trigger_person") return stringList(context.run.triggerActorId);
      if (recipient.type === "page_creator") return stringList(requireTriggerRow(context).createdById);
      if (recipient.type === "person_property") return userIds(context.propertyValues[recipient.propertyId]);
      return userIds(context.variables[recipient.variableName]);
    });
    const uniqueCandidates = [...new Set(candidates)];
    if (uniqueCandidates.length > 20) {
      throw new AutomationActionError("Notification has more than 20 recipients", "AUTOMATION_NOTIFICATION_RECIPIENT_LIMIT");
    }
    let recipientIds = await activeNotificationRecipientIds(
      context.automation.workspaceId,
      uniqueCandidates,
    );
    if (!recipientIds.length) {
      throw new AutomationActionError("Notification has no valid workspace recipient", "AUTOMATION_NOTIFICATION_NO_RECIPIENTS");
    }
    const message = resolveRichText(context, action.message);
    if (!message.trim()) {
      throw new AutomationActionError("Notification message is empty", "AUTOMATION_NOTIFICATION_MESSAGE_EMPTY");
    }
    const requestedPageId = action.pageLink ? scalarString(resolveExpression(context, action.pageLink)) : null;
    const pageId = await accessibleNotificationPageId(context.automation.workspaceId, requestedPageId);
    if (pageId) {
      const access = await getEffectivePageAccessForUsers(pageId, context.automation.workspaceId, recipientIds);
      recipientIds = recipientIds.filter((userId) => (access.get(userId) ?? "none") !== "none");
      if (!recipientIds.length) {
        throw new AutomationActionError("No notification recipient can access the linked page", "AUTOMATION_NOTIFICATION_NO_RECIPIENTS");
      }
    }
    const notifications = await createAutomationNotifications({
      actionId: action.id,
      automationId: context.automation.id,
      message,
      pageId,
      recipientIds,
      runId: context.run.id,
      workspaceId: context.automation.workspaceId,
      env,
    });
    return { deliveredRecipients: notifications.length };
  }
  if (action.type === "send_gmail") {
    return executeGmailAction(context, action, env);
  }
  if (action.type === "send_webhook") {
    return executeWebhookAction(context, action, env);
  }
  if (action.type === "send_slack") {
    return executeSlackAction(context, action, env);
  }
  throw new AutomationActionError("Automation action is not enabled", "AUTOMATION_CAPABILITY_DISABLED");
}
