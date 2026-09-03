import type {
  AutomationEditPagesTarget,
  AutomationPropertyOperation,
  AutomationRichTextExpression,
  DatabaseAutomationAction,
  DatabaseAutomationCatalog,
} from "@zilobase/features/databases/automations"

export type ActionType = DatabaseAutomationAction["type"];
type WebhookHeaderDraft = {
  key: string;
  name: string;
  secretId: string;
  value: string;
};

export type NotionActionDraft = {
  action: DatabaseAutomationAction;
  webhookHeaders: WebhookHeaderDraft[];
};

export const NOTION_ACTION_OPTIONS: Array<{ label: string; type: ActionType }> = [
  { label: "Edit property", type: "edit_trigger_page" },
  { label: "Add page to", type: "add_page" },
  { label: "Edit pages in", type: "edit_pages" },
  { label: "Send notification to", type: "send_notification" },
  { label: "Send mail to", type: "send_gmail" },
  { label: "Send webhook", type: "send_webhook" },
  { label: "Send Slack notification to", type: "send_slack" },
  { label: "Define variables", type: "define_variables" },
];

export function notionActionLabel(type: ActionType) {
  return NOTION_ACTION_OPTIONS.find((item) => item.type === type)?.label ?? type;
}

export function createNotionActionDraft(
  type: ActionType = "edit_trigger_page",
  dataSourceId: string,
  catalog?: DatabaseAutomationCatalog,
): NotionActionDraft {
  const id = crypto.randomUUID();
  const firstUserId = catalog?.users[0]?.id ?? "";
  const firstGmailId = catalog?.gmailConnections.find(({ status }) => status === "connected")?.id ?? "";
  const firstSlackId = catalog?.slackConnections.find(({ status }) => status === "connected")?.id ?? "";
  const operation = defaultOperation();
  const action: DatabaseAutomationAction = type === "edit_trigger_page"
    ? { id, operations: [operation], type }
    : type === "add_page"
      ? { dataSourceId, id, operations: [], type }
      : type === "edit_pages"
        ? {
            id,
            operations: [operation],
            target: defaultFilteredTarget(dataSourceId, id),
            type,
          }
        : type === "send_notification"
          ? {
              id,
              message: textExpression(""),
              pageLink: { reference: "trigger_page", type: "reference" },
              recipients: [{ type: "selected_user", userId: firstUserId }],
              type,
            }
          : type === "send_gmail"
            ? {
                bcc: [],
                cc: [],
                connectionId: firstGmailId,
                id,
                message: textExpression(""),
                subject: textExpression(""),
                to: [{ type: "literal", value: "" }],
                type,
              }
            : type === "send_webhook"
              ? {
                  headers: [],
                  id,
                  payloadFields: [],
                  selectedPropertyIds: [],
                  type,
                  url: "https://",
                }
              : type === "send_slack"
                ? {
                    channelId: "",
                    connectionId: firstSlackId,
                    id,
                    message: { parts: [{ text: "", type: "text" }] },
                    type,
                  }
                : {
                    id,
                    type: "define_variables",
                    variables: [{ expression: { type: "literal", value: "" }, name: "Variable 1" }],
                  };
  return { action, webhookHeaders: [] };
}

export function notionActionDraftFromAction(action: DatabaseAutomationAction): NotionActionDraft {
  return {
    action,
    webhookHeaders: action.type === "send_webhook"
      ? action.headers.map((header) => ({
          key: crypto.randomUUID(),
          name: header.name,
          secretId: header.secretId,
          value: "",
        }))
      : [],
  };
}

export function actionForDefinition(draft: NotionActionDraft): DatabaseAutomationAction {
  if (draft.action.type !== "send_webhook") return draft.action;
  return {
    ...draft.action,
    headers: draft.webhookHeaders.flatMap(({ name, secretId }) =>
      name.trim() && secretId ? [{ name: name.trim(), secretId }] : []
    ),
  };
}

export function resolveWebhookHeader(
  draft: NotionActionDraft,
  key: string,
  secretId: string,
): NotionActionDraft {
  return {
    ...draft,
    webhookHeaders: draft.webhookHeaders.map((header) =>
      header.key === key ? { ...header, secretId, value: "" } : header
    ),
  };
}

export function defaultOperation(propertyId = "name"): AutomationPropertyOperation {
  return { mode: "set", propertyId, value: { type: "literal", value: "" } };
}

export function defaultFilteredTarget(dataSourceId: string, actionId: string): Extract<AutomationEditPagesTarget, { type: "filtered_data_source" }> {
  return { dataSourceId, filter: { conditions: [{ id: `${actionId}-filter-${crypto.randomUUID()}`, operator: "is_not_empty", propertyId: "name", type: "condition" }], match: "all" }, type: "filtered_data_source" };
}

function textExpression(text: string): AutomationRichTextExpression {
  return { parts: [{ text, type: "text" }] };
}
