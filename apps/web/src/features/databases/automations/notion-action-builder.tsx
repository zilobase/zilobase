import { useState } from "react";
import type {
  AutomationFilterDefinition,
  AutomationJsonValue,
  AutomationNotificationRecipient,
  AutomationPropertyOperation,
  AutomationRichTextExpression,
  AutomationTriggerOperand,
  AutomationValueExpression,
  DatabaseAutomationAction,
  DatabaseAutomationCatalog,
  DatabaseAutomationTriggerOperator,
  SlackAutomationRichTextExpression,
} from "@zilobase/features/databases/automations";
import { ChevronDownIcon, Plus, Sparkles, Trash2 } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useSlackAutomationChannels } from "@zilobase/features/databases/automations/react";
import {
  DatabaseConditionValueControl,
  type DatabaseCondition,
} from "../views/view/database-condition-editor";
import type { DatabasePropertyFilterOperator } from "../views/model/database-view-config";

type CatalogProperty = DatabaseAutomationCatalog["properties"][number];
export {
  actionForDefinition,
  createNotionActionDraft,
  NOTION_ACTION_OPTIONS,
  notionActionDraftFromAction,
  notionActionLabel,
  resolveWebhookHeader,
  type NotionActionDraft,
} from "./notion-action-model";
import {
  createNotionActionDraft,
  defaultFilteredTarget,
  defaultOperation,
  NOTION_ACTION_OPTIONS,
  type ActionType,
  type NotionActionDraft,
} from "./notion-action-model";

export function NotionActionEditor({
  catalog,
  databaseId,
  dataSourceId,
  draft,
  index,
  onChange,
  onConnectSlack,
  onMove,
  onRemove,
  scheduled,
}: {
  catalog?: DatabaseAutomationCatalog;
  databaseId: string;
  dataSourceId: string;
  draft: NotionActionDraft;
  index: number;
  onChange: (draft: NotionActionDraft) => void;
  onConnectSlack: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove?: () => void;
  scheduled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const action = draft.action;
  const patch = (next: DatabaseAutomationAction) => onChange({ ...draft, action: next });
  const available = new Map(catalog?.actions.map((item) => [item.type, item]) ?? []);
  return (
    <div className="group/action overflow-hidden rounded-lg border border-stroke-default bg-surface-overlay">
      <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
        <span className="flex size-6 shrink-0 items-center justify-center text-content-secondary"><Sparkles className="size-4" /></span>
        <BuilderSelect
          ariaLabel={`Action ${index + 1} type`}
          className={action.type === "add_page" ? "min-w-0 flex-1" : "w-fit"}
          onValueChange={(value) => onChange(createNotionActionDraft(value as ActionType, dataSourceId, catalog))}
          options={NOTION_ACTION_OPTIONS
            .filter(({ type }) => !(scheduled && type === "edit_trigger_page"))
            .map(({ label, type }) => ({
              disabled: available.get(type)?.available === false,
              label,
              value: type,
            }))}
          value={action.type}
        />
        {action.type === "add_page" ? (
          <DataSourceSelect
            catalog={catalog}
            className="min-w-0 flex-1"
            onChange={(nextId) => patch({ ...action, dataSourceId: nextId, operations: [] })}
            value={action.dataSourceId}
          />
        ) : null}
        <Button aria-label="Move action up" className="ml-auto text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" disabled={index === 0} onClick={() => onMove(-1)} size="icon-sm" variant="ghost">↑</Button>
        <Button aria-label="Move action down" className="text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" onClick={() => onMove(1)} size="icon-sm" variant="ghost">↓</Button>
        {onRemove ? <Button aria-label="Remove action" className="text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" onClick={onRemove} size="icon-sm" variant="ghost"><Trash2 /></Button> : null}
        <Button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} action ${index + 1}`}
          className="text-content-secondary"
          onClick={() => setExpanded((value) => !value)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
        </Button>
      </div>
      {expanded ? (
        <div className="grid gap-1.5 border-t border-stroke-default px-2.5 py-2">
          {available.get(action.type)?.available === false ? (
            <p className="text-xs text-content-secondary">{available.get(action.type)?.reason}</p>
          ) : null}
          {action.type === "define_variables" ? (
            <VariablesEditor action={action} catalog={catalog} onChange={patch} scheduled={scheduled} />
          ) : action.type === "edit_trigger_page" ? (
            <PropertyOperationsEditor
              catalog={catalog}
              dataSourceId={dataSourceId}
              onChange={(operations) => patch({ ...action, operations })}
              operations={action.operations}
              scheduled={scheduled}
            />
          ) : action.type === "add_page" ? (
            <PropertyOperationsEditor catalog={catalog} dataSourceId={action.dataSourceId} onChange={(operations) => patch({ ...action, operations })} operations={action.operations} scheduled={scheduled} />
          ) : action.type === "edit_pages" ? (
            <EditPagesEditor action={action} catalog={catalog} onChange={patch} scheduled={scheduled} sourceDataSourceId={dataSourceId} />
          ) : action.type === "send_notification" ? (
            <NotificationEditor action={action} catalog={catalog} onChange={patch} scheduled={scheduled} />
          ) : action.type === "send_gmail" ? (
            <GmailEditor action={action} catalog={catalog} onChange={patch} scheduled={scheduled} />
          ) : action.type === "send_webhook" ? (
            <WebhookEditor catalog={catalog} draft={draft} onChange={onChange} />
          ) : (
            <SlackEditor action={action} catalog={catalog} databaseId={databaseId} dataSourceId={dataSourceId} onChange={patch} onConnect={onConnectSlack} scheduled={scheduled} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function VariablesEditor({ action, catalog, onChange, scheduled }: {
  action: Extract<DatabaseAutomationAction, { type: "define_variables" }>;
  catalog?: DatabaseAutomationCatalog;
  onChange: (action: DatabaseAutomationAction) => void;
  scheduled: boolean;
}) {
  return <div className="grid gap-2">
    {action.variables.map((variable, index) => (
      <div className="grid gap-2 rounded-md border p-2" key={`${variable.name}:${index}`}>
        <div className="flex gap-2">
          <Input aria-label={`Variable ${index + 1} name`} onChange={(event) => onChange({ ...action, variables: replaceAt(action.variables, index, { ...variable, name: event.target.value }) })} placeholder={`Variable ${index + 1}`} value={variable.name} />
          {action.variables.length > 1 ? <Button aria-label={`Remove variable ${index + 1}`} onClick={() => onChange({ ...action, variables: removeAt(action.variables, index) })} size="icon" variant="ghost"><Trash2 /></Button> : null}
        </div>
        <ExpressionEditor ariaLabel={`Variable ${index + 1} value`} catalog={catalog} onChange={(expression) => onChange({ ...action, variables: replaceAt(action.variables, index, { ...variable, expression }) })} scheduled={scheduled} value={variable.expression} />
      </div>
    ))}
    <Button disabled={action.variables.length >= 25} onClick={() => onChange({ ...action, variables: [...action.variables, { expression: { type: "literal", value: "" }, name: `Variable ${action.variables.length + 1}` }] })} variant="outline"><Plus />Add variable</Button>
  </div>;
}

function PropertyOperationsEditor({ catalog, dataSourceId, onChange, operations, scheduled }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  onChange: (operations: AutomationPropertyOperation[]) => void;
  operations: AutomationPropertyOperation[];
  scheduled: boolean;
}) {
  const properties = writableProperties(catalog, dataSourceId);
  return <div className="grid gap-1.5">
    {operations.map((operation, index) => {
      const property = propertyById(catalog, dataSourceId, operation.propertyId);
      const collection = ["multi_select", "person", "relation"].includes(property?.type ?? "");
      const propertyOptions = properties.map(({ id, name }) => ({ label: name, value: id }));
      if (operation.propertyId && !property) {
        propertyOptions.push({ label: "Deleted property", value: operation.propertyId });
      }
      return <div className="grid gap-1" key={`${operation.propertyId}:${index}`}>
        <div className="grid min-w-0 grid-cols-2 gap-1.5">
          <BuilderSelect className="w-full data-[size=default]:h-8" ariaLabel={`Property ${index + 1}`} onValueChange={(propertyId) => onChange(replaceAt(operations, index, { mode: "set", propertyId, value: { type: "literal", value: "" } }))} options={propertyOptions} value={operation.propertyId} />
          <div className="flex min-w-0 gap-1">
            <BuilderSelect className="w-full data-[size=default]:h-8" ariaLabel={`Property ${index + 1} operation`} onValueChange={(mode) => onChange(replaceAt(operations, index, mode === "clear" ? { mode: "clear", propertyId: operation.propertyId } : { ...operation, mode: mode as "set" | "add" | "remove", value: operation.value ?? { type: "literal", value: "" } }))} options={[
              { label: "Set", value: "set" },
              ...(collection ? [{ label: "Add", value: "add" }, { label: "Remove", value: "remove" }] : []),
              { label: "Clear", value: "clear" },
            ]} value={operation.mode} />
            {operations.length > 1 ? <Button aria-label={`Remove property ${index + 1}`} className="shrink-0" onClick={() => onChange(removeAt(operations, index))} size="icon-sm" variant="ghost"><Trash2 /></Button> : null}
          </div>
        </div>
        {operation.mode !== "clear" ? <PropertyValueEditor ariaLabel={`Property ${index + 1} value`} catalog={catalog} onChange={(value) => onChange(replaceAt(operations, index, { ...operation, value }))} property={property} scheduled={scheduled} value={operation.value ?? { type: "literal", value: "" }} /> : null}
      </div>;
    })}
    <Button className="h-7 justify-start px-1 text-content-secondary" disabled={operations.length >= 100 || properties.length === 0} onClick={() => onChange([...operations, defaultOperation(properties.find((property) => !operations.some((operation) => operation.propertyId === property.id))?.id)])} variant="ghost"><Plus />{operations.length ? "Edit another property" : "Edit property"}</Button>
  </div>;
}

function EditPagesEditor({ action, catalog, onChange, scheduled, sourceDataSourceId }: {
  action: Extract<DatabaseAutomationAction, { type: "edit_pages" }>;
  catalog?: DatabaseAutomationCatalog;
  onChange: (action: DatabaseAutomationAction) => void;
  scheduled: boolean;
  sourceDataSourceId: string;
}) {
  const targetDataSourceId = action.target.type === "filtered_data_source"
    ? action.target.dataSourceId
    : action.target.type === "related_pages"
      ? propertyById(catalog, sourceDataSourceId, action.target.propertyId)?.relatedDataSourceId ?? sourceDataSourceId
      : sourceDataSourceId;
  return <>
    <BuilderSelect ariaLabel="Pages to edit" onValueChange={(type) => onChange({
      ...action,
      target: type === "variable_pages"
        ? { type, variableName: "" }
        : type === "related_pages"
          ? { propertyId: relationProperties(catalog, sourceDataSourceId)[0]?.id ?? "", type }
          : defaultFilteredTarget(sourceDataSourceId, action.id),
    })} options={[
      { label: "Pages from a variable", value: "variable_pages" },
      { label: "Related pages", value: "related_pages" },
      { label: "Pages matching a filter", value: "filtered_data_source" },
    ]} value={action.target.type} />
    {action.target.type === "variable_pages" ? <Input aria-label="Page variable" onChange={(event) => onChange({ ...action, target: { type: "variable_pages", variableName: event.target.value } })} placeholder="Variable name" value={action.target.variableName} /> : null}
    {action.target.type === "related_pages" ? <BuilderSelect ariaLabel="Relation property" onValueChange={(propertyId) => onChange({ ...action, target: { propertyId, type: "related_pages" } })} options={relationProperties(catalog, sourceDataSourceId).map(({ id, name }) => ({ label: name, value: id }))} value={action.target.propertyId} /> : null}
    {action.target.type === "filtered_data_source" ? <>
      <DataSourceSelect catalog={catalog} onChange={(dataSourceId) => onChange({ ...action, target: defaultFilteredTarget(dataSourceId, action.id) })} value={action.target.dataSourceId} />
      <FilterEditor catalog={catalog} dataSourceId={action.target.dataSourceId} filter={action.target.filter} onChange={(filter) => onChange({ ...action, target: { dataSourceId: action.target.type === "filtered_data_source" ? action.target.dataSourceId : sourceDataSourceId, filter, type: "filtered_data_source" } })} />
    </> : null}
    <PropertyOperationsEditor catalog={catalog} dataSourceId={targetDataSourceId} onChange={(operations) => onChange({ ...action, operations })} operations={action.operations} scheduled={scheduled} />
  </>;
}

function FilterEditor({ catalog, dataSourceId, filter, onChange }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  filter: AutomationFilterDefinition;
  onChange: (filter: AutomationFilterDefinition) => void;
}) {
  return <FilterGroupEditor catalog={catalog} dataSourceId={dataSourceId} depth={0} filter={filter} onChange={onChange} />;
}

function FilterGroupEditor({ catalog, dataSourceId, depth, filter, onChange }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  depth: number;
  filter: AutomationFilterDefinition;
  onChange: (filter: AutomationFilterDefinition) => void;
}) {
  const properties = allProperties(catalog, dataSourceId);
  const update = (index: number, condition: AutomationFilterDefinition["conditions"][number]) =>
    onChange({ ...filter, conditions: replaceAt(filter.conditions, index, condition) });
  return <div className="grid gap-2 rounded-md border p-2">
    <BuilderSelect ariaLabel={depth ? `Nested filter ${depth} matching` : "Filter matching"} onValueChange={(match) => onChange({ ...filter, match: match as "all" | "any" })} options={[{ label: "All conditions", value: "all" }, { label: "Any condition", value: "any" }]} value={filter.match} />
    {filter.conditions.map((condition, index) => {
      if (!("type" in condition)) {
        return <div className="grid gap-1" key={`group-${depth}-${index}`}>
          <FilterGroupEditor catalog={catalog} dataSourceId={dataSourceId} depth={depth + 1} filter={condition} onChange={(next) => update(index, next)} />
          {filter.conditions.length > 1 ? <Button onClick={() => onChange({ ...filter, conditions: removeAt(filter.conditions, index) })} size="sm" variant="ghost"><Trash2 />Remove group</Button> : null}
        </div>;
      }
      const property = propertyById(catalog, dataSourceId, condition.propertyId);
      const operators = property?.operators ?? ["is_not_empty"];
      const operandless = ["was_edited", "is_empty", "is_not_empty", "is_checked", "is_unchecked"].includes(condition.operator);
      return <div className="grid grid-cols-2 gap-2" key={condition.id}>
        <BuilderSelect ariaLabel={`Filter property ${index + 1}`} onValueChange={(propertyId) => update(index, { ...condition, operator: propertyById(catalog, dataSourceId, propertyId)?.operators[0] ?? "is_not_empty", propertyId })} options={properties.map(({ id, name }) => ({ label: name, value: id }))} value={condition.propertyId} />
        <BuilderSelect ariaLabel={`Filter operator ${index + 1}`} onValueChange={(operator) => update(index, { ...condition, operator: operator as DatabaseAutomationTriggerOperator })} options={operators.map((operator) => ({ label: humanize(operator), value: operator }))} value={condition.operator} />
        {!operandless && property ? <div className="col-span-2"><AutomationFilterValueControl catalog={catalog} condition={condition} onChange={(operand) => update(index, { ...condition, operand })} property={property} /></div> : null}
        {filter.conditions.length > 1 ? <Button className="col-span-2" onClick={() => onChange({ ...filter, conditions: removeAt(filter.conditions, index) })} size="sm" variant="ghost"><Trash2 />Remove condition</Button> : null}
      </div>;
    })}
    <div className="flex gap-2">
      <Button onClick={() => onChange({ ...filter, conditions: [...filter.conditions, newFilterCondition()] })} size="sm" variant="outline"><Plus />Add condition</Button>
      {depth < 3 ? <Button onClick={() => onChange({ ...filter, conditions: [...filter.conditions, { conditions: [newFilterCondition()], match: "all" }] })} size="sm" variant="outline"><Plus />Add condition group</Button> : null}
    </div>
  </div>;
}

function AutomationFilterValueControl({ catalog, condition, onChange, property }: {
  catalog?: DatabaseAutomationCatalog;
  condition: Extract<AutomationFilterDefinition["conditions"][number], { type: "condition" }>;
  onChange: (operand: AutomationTriggerOperand | undefined) => void;
  property: CatalogProperty;
}) {
  const values = automationOperandValues(condition.operand);
  const valueOptions = property.type === "person"
    ? (catalog?.users ?? []).map(({ id, name }) => ({ label: name, value: id }))
    : property.options.map(({ color, id, name }) => ({ color, label: name, value: id }));
  const databaseCondition: DatabaseCondition = {
    id: condition.id,
    label: property.name,
    operator: condition.operator as DatabasePropertyFilterOperator,
    operatorLabel: humanize(condition.operator),
    propertyId: property.id,
    propertyType: property.type,
    values,
  };
  return <DatabaseConditionValueControl
    condition={databaseCondition}
    onUpdate={(patch) => onChange(automationOperandFromValues(
      patch.values ?? values,
      property.type,
      condition.operator,
    ))}
    valueOptions={valueOptions}
  />;
}

function automationOperandValues(operand: AutomationTriggerOperand | undefined): string[] {
  if (operand === undefined || operand === null) return [];
  if (typeof operand === "string" || typeof operand === "number" || typeof operand === "boolean") return [String(operand)];
  if (operand.type === "entity") return [operand.id];
  if (operand.type === "entity_list") return operand.ids;
  if (operand.type === "date") return [operand.value.slice(0, 10)];
  if (operand.type === "date_range") return [operand.start.slice(0, 10), operand.end.slice(0, 10)];
  return [`relative:${operand.direction}:${operand.unit}`];
}

function automationOperandFromValues(
  values: string[],
  propertyType: string,
  operator: DatabaseAutomationTriggerOperator,
): AutomationTriggerOperand | undefined {
  const value = values[0];
  if (!value) return undefined;
  if (propertyType === "number") return Number(value);
  if (propertyType === "checkbox") return value === "true";
  if (propertyType === "date") {
    if (operator === "is_between") {
      if (!values[1]) return undefined;
      return { end: new Date(values[1]).toISOString(), start: new Date(value).toISOString(), type: "date_range" };
    }
    if (operator === "is_relative_to_today") {
      const [, direction = "this", unit = "week"] = value.split(":");
      return { amount: 1, direction: direction as "next" | "past" | "this", type: "relative_date", unit: unit as "day" | "month" | "week" | "year" };
    }
    return { precision: "date", type: "date", value: new Date(value).toISOString() };
  }
  if (["select", "status", "multi_select"].includes(propertyType)) {
    return values.length > 1
      ? { entityType: "option", ids: values, type: "entity_list" }
      : { entityType: "option", id: value, type: "entity" };
  }
  if (propertyType === "person") {
    return values.length > 1
      ? { entityType: "user", ids: values, type: "entity_list" }
      : { entityType: "user", id: value, type: "entity" };
  }
  if (propertyType === "relation") return { entityType: "page", id: value, type: "entity" };
  return value;
}

function newFilterCondition(): Extract<AutomationFilterDefinition["conditions"][number], { type: "condition" }> {
  return { id: crypto.randomUUID(), operator: "is_not_empty", propertyId: "name", type: "condition" };
}

function NotificationEditor({ action, catalog, onChange, scheduled }: {
  action: Extract<DatabaseAutomationAction, { type: "send_notification" }>;
  catalog?: DatabaseAutomationCatalog;
  onChange: (action: DatabaseAutomationAction) => void;
  scheduled: boolean;
}) {
  return <>
    <RecipientList catalog={catalog} onChange={(recipients) => onChange({ ...action, recipients })} recipients={action.recipients} scheduled={scheduled} />
    <RichTextEditor ariaLabel="Notification message" catalog={catalog} onChange={(message) => onChange({ ...action, message })} scheduled={scheduled} value={action.message} />
    <label className="flex items-center gap-2 text-xs">
      <input checked={Boolean(action.pageLink)} disabled={scheduled} onChange={(event) => onChange(event.target.checked ? { ...action, pageLink: { reference: "trigger_page", type: "reference" } } : omit(action, "pageLink"))} type="checkbox" />
      Link notification to the trigger page
    </label>
  </>;
}

function RecipientList({ catalog, onChange, recipients, scheduled }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (recipients: AutomationNotificationRecipient[]) => void;
  recipients: AutomationNotificationRecipient[];
  scheduled: boolean;
}) {
  return <div className="grid gap-2">
    {recipients.map((recipient, index) => <div className="flex gap-2" key={`${recipient.type}:${index}`}>
      <BuilderSelect ariaLabel={`Notification recipient ${index + 1} type`} onValueChange={(type) => onChange(replaceAt(recipients, index, defaultRecipient(type as AutomationNotificationRecipient["type"], catalog)))} options={recipientTypeOptions(scheduled)} value={recipient.type} />
      <RecipientValueEditor catalog={catalog} onChange={(next) => onChange(replaceAt(recipients, index, next))} recipient={recipient} />
      {recipients.length > 1 ? <Button aria-label={`Remove notification recipient ${index + 1}`} onClick={() => onChange(removeAt(recipients, index))} size="icon" variant="ghost"><Trash2 /></Button> : null}
    </div>)}
    <Button disabled={recipients.length >= 20} onClick={() => onChange([...recipients, defaultRecipient("selected_user", catalog)])} variant="outline"><Plus />Add recipient</Button>
  </div>;
}

function RecipientValueEditor({ catalog, onChange, recipient }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (recipient: AutomationNotificationRecipient) => void;
  recipient: AutomationNotificationRecipient;
}) {
  if (recipient.type === "selected_user") return <BuilderSelect ariaLabel="Workspace person" onValueChange={(userId) => onChange({ ...recipient, userId })} options={(catalog?.users ?? []).map(({ id, name }) => ({ label: name, value: id }))} value={recipient.userId} />;
  if (recipient.type === "person_property") return <BuilderSelect ariaLabel="People property" onValueChange={(propertyId) => onChange({ ...recipient, propertyId })} options={(catalog?.properties ?? []).filter(({ type }) => type === "person").map(({ id, name }) => ({ label: name, value: id }))} value={recipient.propertyId} />;
  if (recipient.type === "variable") return <Input aria-label="Recipient variable" onChange={(event) => onChange({ ...recipient, variableName: event.target.value })} placeholder="Variable name" value={recipient.variableName} />;
  return <span className="flex min-h-8 flex-1 items-center text-xs text-content-secondary">Dynamic recipient</span>;
}

function GmailEditor({ action, catalog, onChange, scheduled }: {
  action: Extract<DatabaseAutomationAction, { type: "send_gmail" }>;
  catalog?: DatabaseAutomationCatalog;
  onChange: (action: DatabaseAutomationAction) => void;
  scheduled: boolean;
}) {
  return <>
    <BuilderSelect ariaLabel="Send mail from" onValueChange={(connectionId) => onChange({ ...action, connectionId })} options={(catalog?.gmailConnections ?? []).filter(({ status }) => status === "connected").map(({ email, id }) => ({ label: email, value: id }))} value={action.connectionId} />
    <ExpressionListEditor addLabel="Add To recipient" ariaLabel="To" catalog={catalog} min={1} onChange={(to) => onChange({ ...action, to })} scheduled={scheduled} value={action.to} />
    <ExpressionListEditor addLabel="Add CC recipient" ariaLabel="CC" catalog={catalog} onChange={(cc) => onChange({ ...action, cc })} scheduled={scheduled} value={action.cc} />
    <ExpressionListEditor addLabel="Add BCC recipient" ariaLabel="BCC" catalog={catalog} onChange={(bcc) => onChange({ ...action, bcc })} scheduled={scheduled} value={action.bcc} />
    <RichTextEditor ariaLabel="Email subject" catalog={catalog} onChange={(subject) => onChange({ ...action, subject })} scheduled={scheduled} value={action.subject} />
    <RichTextEditor ariaLabel="Email message" catalog={catalog} onChange={(message) => onChange({ ...action, message })} scheduled={scheduled} value={action.message} />
    <OptionalExpressionEditor ariaLabel="Send with display name" catalog={catalog} onChange={(displayName) => onChange(displayName ? { ...action, displayName } : omit(action, "displayName"))} scheduled={scheduled} value={action.displayName} />
    <OptionalExpressionEditor ariaLabel="Send replies to" catalog={catalog} onChange={(replyTo) => onChange(replyTo ? { ...action, replyTo } : omit(action, "replyTo"))} scheduled={scheduled} value={action.replyTo} />
  </>;
}

function WebhookEditor({ catalog, draft, onChange }: {
  catalog?: DatabaseAutomationCatalog;
  draft: NotionActionDraft;
  onChange: (draft: NotionActionDraft) => void;
}) {
  const action = draft.action as Extract<DatabaseAutomationAction, { type: "send_webhook" }>;
  return <>
    <Input aria-label="Webhook URL" onChange={(event) => onChange({ ...draft, action: { ...action, url: event.target.value } })} placeholder="https://example.com/webhook" type="url" value={action.url} />
    <fieldset className="grid gap-2 rounded-md border p-2">
      <legend className="px-1 text-xs font-medium">Properties for webhook content</legend>
      <label className="flex items-center gap-2 text-xs"><input checked={action.selectedPropertyIds.includes("name")} onChange={() => onChange({ ...draft, action: { ...action, selectedPropertyIds: toggle(action.selectedPropertyIds, "name") } })} type="checkbox" />Name</label>
      {(catalog?.properties ?? []).map((property) => <label className="flex items-center gap-2 text-xs" key={property.id}><input checked={action.selectedPropertyIds.includes(property.id)} onChange={() => onChange({ ...draft, action: { ...action, selectedPropertyIds: toggle(action.selectedPropertyIds, property.id) } })} type="checkbox" />{property.name}</label>)}
    </fieldset>
    <div className="grid gap-2">
      {draft.webhookHeaders.map((header, index) => <div className="grid grid-cols-[1fr_1fr_auto] gap-2" key={header.key}>
        <Input aria-label={`Webhook header ${index + 1} key`} onChange={(event) => onChange({ ...draft, webhookHeaders: replaceAt(draft.webhookHeaders, index, { ...header, name: event.target.value }) })} placeholder="Header key" value={header.name} />
        <Input aria-label={`Webhook header ${index + 1} value`} onChange={(event) => onChange({ ...draft, webhookHeaders: replaceAt(draft.webhookHeaders, index, { ...header, secretId: event.target.value ? "" : header.secretId, value: event.target.value }) })} placeholder={header.secretId ? "Stored secret — enter to replace" : "Header value"} type="password" value={header.value} />
        <Button aria-label={`Remove webhook header ${index + 1}`} onClick={() => onChange({ ...draft, webhookHeaders: removeAt(draft.webhookHeaders, index) })} size="icon" variant="ghost"><Trash2 /></Button>
      </div>)}
      <Button onClick={() => onChange({ ...draft, webhookHeaders: [...draft.webhookHeaders, { key: crypto.randomUUID(), name: "", secretId: "", value: "" }] })} variant="outline"><Plus />Add custom header</Button>
    </div>
  </>;
}

function SlackEditor({ action, catalog, databaseId, dataSourceId, onChange, onConnect, scheduled }: {
  action: Extract<DatabaseAutomationAction, { type: "send_slack" }>;
  catalog?: DatabaseAutomationCatalog;
  databaseId: string;
  dataSourceId: string;
  onChange: (action: DatabaseAutomationAction) => void;
  onConnect: () => void;
  scheduled: boolean;
}) {
  const channels = useSlackAutomationChannels(databaseId, dataSourceId, action.connectionId);
  return <>
    <BuilderSelect ariaLabel="Slack workspace" onValueChange={(connectionId) => onChange({ ...action, channelId: "", connectionId })} options={(catalog?.slackConnections ?? []).filter(({ status }) => status === "connected").map(({ id, teamName }) => ({ label: teamName, value: id }))} value={action.connectionId} />
    {!action.connectionId ? <Button onClick={onConnect} variant="outline">Connect Slack</Button> : null}
    <BuilderSelect ariaLabel="Slack channel" disabled={!action.connectionId || channels.isLoading} onValueChange={(channelId) => onChange({ ...action, channelId })} options={(channels.data?.channels ?? []).map(({ id, isPrivate, name }) => ({ label: `${isPrivate ? "🔒 " : "#"}${name}`, value: id }))} value={action.channelId} />
    <SlackRichTextEditor catalog={catalog} onChange={(message) => onChange({ ...action, message })} scheduled={scheduled} value={action.message} />
    {channels.isError ? <p className="text-xs text-action-danger-text">Slack channels could not be loaded. Reconnect the workspace.</p> : null}
  </>;
}

function ExpressionListEditor({ addLabel, ariaLabel, catalog, min = 0, onChange, scheduled, value }: {
  addLabel: string;
  ariaLabel: string;
  catalog?: DatabaseAutomationCatalog;
  min?: number;
  onChange: (value: AutomationValueExpression[]) => void;
  scheduled: boolean;
  value: AutomationValueExpression[];
}) {
  return <div className="grid gap-2 rounded-md border p-2"><span className="text-xs font-medium">{ariaLabel}</span>
    {value.map((expression, index) => <div className="flex gap-2" key={index}><ExpressionEditor ariaLabel={`${ariaLabel} ${index + 1}`} catalog={catalog} onChange={(next) => onChange(replaceAt(value, index, next))} scheduled={scheduled} value={expression} />{value.length > min ? <Button aria-label={`Remove ${ariaLabel} ${index + 1}`} onClick={() => onChange(removeAt(value, index))} size="icon" variant="ghost"><Trash2 /></Button> : null}</div>)}
    <Button onClick={() => onChange([...value, { type: "literal", value: "" }])} size="sm" variant="outline"><Plus />{addLabel}</Button>
  </div>;
}

function OptionalExpressionEditor({ ariaLabel, catalog, onChange, scheduled, value }: {
  ariaLabel: string;
  catalog?: DatabaseAutomationCatalog;
  onChange: (value?: AutomationValueExpression) => void;
  scheduled: boolean;
  value?: AutomationValueExpression;
}) {
  return <div className="grid gap-2 rounded-md border p-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">{ariaLabel}</span>{value ? <Button onClick={() => onChange(undefined)} size="sm" variant="ghost">Remove</Button> : <Button onClick={() => onChange({ type: "literal", value: "" })} size="sm" variant="ghost">Add</Button>}</div>{value ? <ExpressionEditor ariaLabel={ariaLabel} catalog={catalog} onChange={onChange} scheduled={scheduled} value={value} /> : null}</div>;
}

function RichTextEditor({ ariaLabel, catalog, onChange, scheduled, value }: {
  ariaLabel: string;
  catalog?: DatabaseAutomationCatalog;
  onChange: (value: AutomationRichTextExpression) => void;
  scheduled: boolean;
  value: AutomationRichTextExpression;
}) {
  return <div className="grid gap-2 rounded-md border p-2"><span className="text-xs font-medium">{ariaLabel}</span>
    {value.parts.map((part, index) => <div className="flex gap-2" key={index}>
      <BuilderSelect ariaLabel={`${ariaLabel} part ${index + 1} type`} className="w-28" onValueChange={(type) => onChange({ parts: replaceAt(value.parts, index, type === "text" ? { text: "", type: "text" } : { type: "value", value: { type: "literal", value: "" } }) })} options={[{ label: "Text", value: "text" }, { label: "@ / ∑", value: "value" }]} value={part.type} />
      {part.type === "text" ? <Textarea aria-label={`${ariaLabel} text ${index + 1}`} className="min-h-8" onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, text: event.target.value }) })} value={part.text} /> : <ExpressionEditor ariaLabel={`${ariaLabel} dynamic value ${index + 1}`} catalog={catalog} onChange={(next) => onChange({ parts: replaceAt(value.parts, index, { ...part, value: next }) })} scheduled={scheduled} value={part.value} />}
      {value.parts.length > 1 ? <Button aria-label={`Remove ${ariaLabel} part ${index + 1}`} onClick={() => onChange({ parts: removeAt(value.parts, index) })} size="icon" variant="ghost"><Trash2 /></Button> : null}
    </div>)}
    <Button onClick={() => onChange({ parts: [...value.parts, { type: "value", value: { type: "literal", value: "" } }] })} size="sm" variant="outline"><Plus />Add text, mention, or formula</Button>
  </div>;
}

function SlackRichTextEditor({ catalog, onChange, scheduled, value }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (value: SlackAutomationRichTextExpression) => void;
  scheduled: boolean;
  value: SlackAutomationRichTextExpression;
}) {
  return <div className="grid gap-2 rounded-md border p-2"><span className="text-xs font-medium">Slack message</span>
    {value.parts.map((part, index) => <div className="flex gap-2" key={index}>
      <BuilderSelect ariaLabel={`Slack part ${index + 1} type`} className="w-32" onValueChange={(type) => onChange({ parts: replaceAt(value.parts, index, type === "text" ? { text: "", type } : type === "value" ? { type, value: { type: "literal", value: "" } } : type === "link" ? { label: "", type, url: "https://" } : type === "slack_broadcast" ? { kind: "here", type } : { id: "", kind: "user", type: "slack_mention" }) })} options={[{ label: "Text", value: "text" }, { label: "Dynamic @", value: "value" }, { label: "Slack mention", value: "slack_mention" }, { label: "@channel / @here", value: "slack_broadcast" }, { label: "Link", value: "link" }]} value={part.type} />
      {part.type === "text" ? <div className="grid flex-1 gap-1"><Textarea aria-label={`Slack text ${index + 1}`} className="min-h-8" onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, text: event.target.value }) })} value={part.text} /><div className="flex gap-3 text-xs"><label className="flex items-center gap-1"><input checked={Boolean(part.bold)} onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, bold: event.target.checked || undefined }) })} type="checkbox" />Bold</label><label className="flex items-center gap-1"><input checked={Boolean(part.italic)} onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, italic: event.target.checked || undefined }) })} type="checkbox" />Italic</label></div></div> : part.type === "value" ? <ExpressionEditor ariaLabel={`Slack dynamic value ${index + 1}`} allowFormula={false} catalog={catalog} onChange={(next) => onChange({ parts: replaceAt(value.parts, index, { ...part, value: next }) })} scheduled={scheduled} value={part.value} /> : part.type === "slack_mention" ? <><BuilderSelect ariaLabel={`Slack mention ${index + 1} type`} className="w-28" onValueChange={(kind) => onChange({ parts: replaceAt(value.parts, index, { ...part, kind: kind as "channel" | "user" }) })} options={[{ label: "Person", value: "user" }, { label: "Channel", value: "channel" }]} value={part.kind} /><Input aria-label={`Slack mention ${index + 1} ID`} onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, id: event.target.value }) })} placeholder="Slack ID" value={part.id} /></> : part.type === "slack_broadcast" ? <BuilderSelect ariaLabel={`Slack broadcast ${index + 1}`} onValueChange={(kind) => onChange({ parts: replaceAt(value.parts, index, { ...part, kind: kind as "channel" | "here" }) })} options={[{ label: "@here", value: "here" }, { label: "@channel", value: "channel" }]} value={part.kind} /> : <><Input aria-label={`Slack link ${index + 1} label`} onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, label: event.target.value }) })} placeholder="Label" value={part.label} /><Input aria-label={`Slack link ${index + 1} URL`} onChange={(event) => onChange({ parts: replaceAt(value.parts, index, { ...part, url: event.target.value }) })} placeholder="https://" value={part.url} /></>}
      {value.parts.length > 1 ? <Button aria-label={`Remove Slack part ${index + 1}`} onClick={() => onChange({ parts: removeAt(value.parts, index) })} size="icon" variant="ghost"><Trash2 /></Button> : null}
    </div>)}
    <Button onClick={() => onChange({ parts: [...value.parts, { type: "value", value: { reference: "now", type: "reference" } }] })} size="sm" variant="outline"><Plus />Add message content</Button>
  </div>;
}

function PropertyValueEditor({ ariaLabel, catalog, onChange, property, scheduled, value }: {
  ariaLabel: string;
  catalog?: DatabaseAutomationCatalog;
  onChange: (value: AutomationValueExpression) => void;
  property?: CatalogProperty;
  scheduled: boolean;
  value: AutomationValueExpression;
}) {
  if (value.type !== "literal") return <ExpressionEditor ariaLabel={ariaLabel} catalog={catalog} onChange={onChange} scheduled={scheduled} value={value} />;
  const options = property?.options ?? [];
  if (property && ["select", "status"].includes(property.type)) {
    const selected = entityIds(value.value)[0] ?? "";
    const selectOptions = options.map(({ id, name }) => ({ label: name, value: id }));
    if (selected && !options.some(({ id }) => id === selected)) {
      selectOptions.push({ label: "Deleted option", value: selected });
    }
    return <div className="grid min-w-0 grid-cols-2 gap-1.5"><ExpressionModeSelect allowFormula onChange={(mode) => onChange(expressionForMode(mode))} value="literal" /><BuilderSelect className="w-full data-[size=default]:h-8" ariaLabel={ariaLabel} onValueChange={(id) => onChange({ type: "literal", value: { entityType: "option", id, type: "entity" } })} options={selectOptions} value={selected} /></div>;
  }
  if (property && property.type === "multi_select") {
    const selected = new Set(entityIds(value.value));
    const renderedOptions = [
      ...options,
      ...[...selected]
        .filter((id) => !options.some((option) => option.id === id))
        .map((id) => ({ id, name: "Deleted option" })),
    ];
    return <div className="grid gap-2"><ExpressionModeSelect allowFormula onChange={(mode) => onChange(expressionForMode(mode))} value="literal" /><div className="flex flex-wrap gap-2">{renderedOptions.map((option) => <label className="flex items-center gap-1 text-xs" key={option.id}><Checkbox checked={selected.has(option.id)} onCheckedChange={() => onChange({ type: "literal", value: toggleEntityList(value.value, "option", option.id) })} />{option.name}</label>)}</div></div>;
  }
  if (property?.type === "person" && catalog?.users.length) {
    const selected = new Set(entityIds(value.value));
    return <div className="grid gap-2"><ExpressionModeSelect allowFormula onChange={(mode) => onChange(expressionForMode(mode))} value="literal" /><div className="flex flex-wrap gap-2">{catalog.users.map((person) => <label className="flex items-center gap-1 text-xs" key={person.id}><input checked={selected.has(person.id)} onChange={() => onChange({ type: "literal", value: toggleEntityList(value.value, "user", person.id) })} type="checkbox" />{person.name}</label>)}</div></div>;
  }
  return <ExpressionEditor ariaLabel={ariaLabel} catalog={catalog} onChange={onChange} scheduled={scheduled} value={value} />;
}

function ExpressionEditor({ allowFormula = true, ariaLabel, catalog, onChange, scheduled, value }: {
  allowFormula?: boolean;
  ariaLabel: string;
  catalog?: DatabaseAutomationCatalog;
  onChange: (value: AutomationValueExpression) => void;
  scheduled: boolean;
  value: AutomationValueExpression;
}) {
  const mode = value.type === "reference" ? "mention" : value.type;
  return <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
    <ExpressionModeSelect allowFormula={allowFormula} onChange={(nextMode) => onChange(expressionForMode(nextMode))} value={mode} />
    {value.type === "literal" ? <Input aria-label={ariaLabel} onChange={(event) => onChange({ type: "literal", value: parseLiteral(event.target.value) })} placeholder="Value" value={formatLiteral(value.value)} /> : value.type === "formula" ? <Textarea aria-label={ariaLabel} className="min-h-8 font-mono" onChange={(event) => onChange({ ...value, expression: event.target.value })} placeholder="Formula" value={value.expression} /> : <ReferenceEditor ariaLabel={ariaLabel} catalog={catalog} onChange={onChange} scheduled={scheduled} value={value} />}
  </div>;
}

function ExpressionModeSelect({ allowFormula, onChange, value }: { allowFormula: boolean; onChange: (value: "formula" | "literal" | "mention") => void; value: "formula" | "literal" | "mention" }) {
  return <BuilderSelect className="w-full data-[size=default]:h-8" ariaLabel="Value type" onValueChange={(next) => onChange(next as "formula" | "literal" | "mention")} options={[{ label: "Value", value: "literal" }, { label: "@ Mention", value: "mention" }, ...(allowFormula ? [{ label: "∑ Formula", value: "formula" }] : [])]} value={value} />;
}

function ReferenceEditor({ ariaLabel, catalog, onChange, scheduled, value }: {
  ariaLabel: string;
  catalog?: DatabaseAutomationCatalog;
  onChange: (value: AutomationValueExpression) => void;
  scheduled: boolean;
  value: Extract<AutomationValueExpression, { type: "reference" }>;
}) {
  const fixed = scheduled
    ? ["now", "today", "variable", "selected_person", "selected_page", "selected_group", "selected_teamspace", "action_output"]
    : ["trigger_page", "trigger_property", "trigger_person", "page_creator", "page_last_editor", "now", "today", "variable", "selected_person", "selected_page", "selected_group", "selected_teamspace", "action_output"];
  return <div className="grid gap-2">
    <BuilderSelect ariaLabel={`${ariaLabel} mention`} onValueChange={(reference) => onChange(defaultReference(reference))} options={fixed.map((reference) => ({ label: humanize(reference), value: reference }))} value={value.reference} />
    {value.reference === "trigger_property" ? <BuilderSelect ariaLabel={`${ariaLabel} property`} onValueChange={(propertyId) => onChange({ ...value, propertyId })} options={(catalog?.properties ?? []).map(({ id, name }) => ({ label: name, value: id }))} value={value.propertyId} /> : null}
    {value.reference === "selected_person" ? <BuilderSelect ariaLabel={`${ariaLabel} person`} onValueChange={(userId) => onChange({ ...value, userId })} options={(catalog?.users ?? []).map(({ id, name }) => ({ label: name, value: id }))} value={value.userId} /> : null}
    {value.reference === "variable" ? <Input aria-label={`${ariaLabel} variable`} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="Variable name" value={value.name} /> : null}
    {value.reference === "selected_page" ? <Input aria-label={`${ariaLabel} page`} onChange={(event) => onChange({ ...value, pageId: event.target.value })} placeholder="Page ID" value={value.pageId} /> : null}
    {value.reference === "selected_group" ? <Input aria-label={`${ariaLabel} group`} onChange={(event) => onChange({ ...value, groupId: event.target.value })} placeholder="Group ID" value={value.groupId} /> : null}
    {value.reference === "selected_teamspace" ? <Input aria-label={`${ariaLabel} teamspace`} onChange={(event) => onChange({ ...value, teamspaceId: event.target.value })} placeholder="Teamspace ID" value={value.teamspaceId} /> : null}
    {value.reference === "action_output" ? <><Input aria-label={`${ariaLabel} action ID`} onChange={(event) => onChange({ ...value, actionId: event.target.value })} placeholder="Earlier action ID" value={value.actionId} /><Input aria-label={`${ariaLabel} output`} onChange={(event) => onChange({ ...value, output: event.target.value })} placeholder="Output name" value={value.output} /></> : null}
  </div>;
}

function DataSourceSelect({ catalog, className, onChange, value }: { catalog?: DatabaseAutomationCatalog; className?: string; onChange: (value: string) => void; value: string }) {
  return <BuilderSelect ariaLabel="Select database" className={className} onValueChange={onChange} options={(catalog?.dataSources ?? []).map(({ id, name }) => ({ label: name, value: id }))} value={value} />;
}

function BuilderSelect({ ariaLabel, className, disabled, onValueChange, options, value }: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: Array<{ disabled?: boolean; label: string; value: string }>;
  value: string;
}) {
  const placeholder = "__automation_empty__";
  return <Select disabled={disabled} onValueChange={(next) => onValueChange(next === placeholder ? "" : next)} value={value || placeholder}>
    <SelectTrigger aria-label={ariaLabel} className={className}><SelectValue /></SelectTrigger>
    <SelectContent>{options.length ? options.map((option) => <SelectItem disabled={option.disabled} key={option.value || placeholder} value={option.value || placeholder}>{option.label}</SelectItem>) : <SelectItem disabled value={placeholder}>None available</SelectItem>}</SelectContent>
  </Select>;
}

function defaultRecipient(type: AutomationNotificationRecipient["type"], catalog?: DatabaseAutomationCatalog): AutomationNotificationRecipient {
  if (type === "selected_user") return { type, userId: catalog?.users[0]?.id ?? "" };
  if (type === "person_property") return { propertyId: catalog?.properties.find((property) => property.type === "person")?.id ?? "", type };
  if (type === "variable") return { type, variableName: "" };
  return { type };
}

function recipientTypeOptions(scheduled: boolean) {
  return [
    { label: "Person in workspace", value: "selected_user" },
    ...(!scheduled ? [{ label: "Whoever triggered", value: "trigger_person" }, { label: "Page creator", value: "page_creator" }, { label: "People property", value: "person_property" }] : []),
    { label: "Variable", value: "variable" },
  ];
}

function defaultReference(reference: string): Extract<AutomationValueExpression, { type: "reference" }> {
  if (reference === "trigger_property") return { propertyId: "", reference, type: "reference" };
  if (reference === "variable") return { name: "", reference, type: "reference" };
  if (reference === "action_output") return { actionId: "", output: "value", reference, type: "reference" };
  if (reference === "selected_person") return { reference, type: "reference", userId: "" };
  if (reference === "selected_page") return { pageId: "", reference, type: "reference" };
  if (reference === "selected_group") return { groupId: "", reference, type: "reference" };
  if (reference === "selected_teamspace") return { reference, teamspaceId: "", type: "reference" };
  return { reference: reference as "trigger_page" | "trigger_person" | "page_creator" | "page_last_editor" | "now" | "today", type: "reference" };
}

function expressionForMode(mode: "formula" | "literal" | "mention"): AutomationValueExpression {
  return mode === "formula" ? { expression: "", type: "formula" } : mode === "mention" ? { reference: "now", type: "reference" } : { type: "literal", value: "" };
}

function allProperties(catalog: DatabaseAutomationCatalog | undefined, dataSourceId: string): CatalogProperty[] {
  const source = catalog?.dataSources.find(({ id }) => id === dataSourceId);
  const properties = source?.properties ?? (dataSourceId === catalog?.dataSourceId ? catalog.properties : []);
  return [{ id: "name", name: "Name", operators: ["was_edited", "is", "is_not", "contains", "does_not_contain", "starts_with", "ends_with", "is_empty", "is_not_empty"], options: [], type: "title", writable: true }, ...properties];
}

function writableProperties(catalog: DatabaseAutomationCatalog | undefined, dataSourceId: string) {
  return allProperties(catalog, dataSourceId).filter(({ writable }) => writable);
}

function relationProperties(catalog: DatabaseAutomationCatalog | undefined, dataSourceId: string) {
  return allProperties(catalog, dataSourceId).filter(({ type }) => type === "relation");
}

function propertyById(catalog: DatabaseAutomationCatalog | undefined, dataSourceId: string, propertyId: string) {
  return allProperties(catalog, dataSourceId).find(({ id }) => id === propertyId);
}

function parseLiteral(value: string): AutomationJsonValue {
  const trimmed = value.trim();
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try { return JSON.parse(trimmed) as AutomationJsonValue; } catch { /* retain text */ }
  }
  return value;
}

function formatLiteral(value: AutomationJsonValue) {
  return typeof value === "string" ? value : value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

function entityIds(value: AutomationJsonValue): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && "id" in item && typeof item.id === "string" ? [item.id] : []);
}

function toggleEntityList(value: AutomationJsonValue, entityType: "option" | "user", id: string): AutomationJsonValue {
  const selected = new Set(entityIds(value));
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  return [...selected].map((itemId) => ({ entityType, id: itemId, type: "entity" }));
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function removeAt<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function toggle(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const next = { ...value };
  delete next[key];
  return next;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
