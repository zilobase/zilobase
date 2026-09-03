import { createHash } from "node:crypto";

import {
  databaseAutomationDefinitionSchema,
  type AutomationFilterDefinition,
  type AutomationReference,
  type DatabaseAutomationDefinition,
  type DatabaseAutomationDependency,
  type DatabaseAutomationTriggerOperator,
  type DatabaseAutomationValidationError,
  type DatabaseAutomationValidationResult,
} from "@zilobase/features/databases/automations";
import {
  FormulaParser,
  tokenizeFormula,
} from "@zilobase/features/databases/formula/syntax";

export type AutomationPropertyMetadata = {
  dataSourceId: string;
  id: string;
  icon?: string;
  name: string;
  options?: Array<{ id: string; name: string }>;
  relatedDataSourceId?: string;
  type: string;
  writable: boolean;
};

export type AutomationViewMetadata = {
  dataSourceId: string;
  id: string;
  name: string;
  type: string;
};

export type DatabaseAutomationCompilationContext = {
  allowHttpWebhookDomains?: Set<string>;
  capabilities?: Partial<DatabaseAutomationCapabilities>;
  dataSourceIds: Set<string>;
  gmailConnectionIds?: Set<string>;
  invalidWebhookActionIds?: Set<string>;
  parentDatabaseId: string;
  propertiesByDataSource: Map<string, Map<string, AutomationPropertyMetadata>>;
  secretIds?: Set<string>;
  slackConnectionIds?: Set<string>;
  sourceDataSourceId: string;
  userIds?: Set<string>;
  views: Map<string, AutomationViewMetadata>;
};

export type DatabaseAutomationCapabilities = {
  gmail: boolean;
  notifications: boolean;
  schedules: boolean;
  slack: boolean;
  webhooks: boolean;
};

export type CompiledDatabaseAutomationDefinition = {
  compilerVersion: 1;
  definition: DatabaseAutomationDefinition;
  dependencies: DatabaseAutomationDependency[];
  propertyTypes: Record<string, string>;
};

export type DatabaseAutomationCompilationResult = {
  compiledDefinition: CompiledDatabaseAutomationDefinition | null;
  definition: DatabaseAutomationDefinition | null;
  definitionHash: string | null;
  validation: DatabaseAutomationValidationResult;
};

const defaultCapabilities: DatabaseAutomationCapabilities = {
  gmail: false,
  notifications: false,
  schedules: false,
  slack: false,
  webhooks: false,
};

const textOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is", "is_not", "contains", "does_not_contain",
  "starts_with", "ends_with", "is_empty", "is_not_empty",
]);
const numberOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is", "is_not", "greater_than", "less_than",
  "greater_than_or_equal", "less_than_or_equal", "is_empty", "is_not_empty",
]);
const choiceOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is", "is_not", "is_empty", "is_not_empty",
]);
const collectionOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "contains", "does_not_contain", "is_empty", "is_not_empty",
]);
const dateOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is", "is_not", "is_before", "is_after", "is_on_or_before",
  "is_on_or_after", "is_between", "is_relative_to_today", "is_empty", "is_not_empty",
]);
const checkboxOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is_checked", "is_unchecked",
]);
const filesOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is_empty", "is_not_empty",
]);
const derivedPropertyTypes = new Set([
  "button", "created_time", "edited_time", "formula", "id", "rollup",
]);
const scalarPropertyTypes = new Set([
  "checkbox", "date", "email", "number", "phone", "place", "select", "status",
  "text", "title", "url", "verification",
]);
const collectionPropertyTypes = new Set(["multi_select", "person", "relation"]);
const operandlessOperators = new Set<DatabaseAutomationTriggerOperator>([
  "was_edited", "is_empty", "is_not_empty", "is_checked", "is_unchecked",
]);

export function compileDatabaseAutomationDefinition(
  input: unknown,
  context: DatabaseAutomationCompilationContext,
): DatabaseAutomationCompilationResult {
  const parsed = databaseAutomationDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      code: "invalid_definition",
      message: issue.message,
      path: issue.path.map((segment) => typeof segment === "symbol" ? String(segment) : segment),
    }));
    return invalidResult(errors);
  }

  const definition = parsed.data;
  const errors: DatabaseAutomationValidationError[] = [];
  const warnings: DatabaseAutomationValidationError[] = [];
  const dependencies = new Map<string, DatabaseAutomationDependency>();
  const propertyTypes: Record<string, string> = {};
  const capabilities = { ...defaultCapabilities, ...context.capabilities };
  const addDependency = (
    dependencyType: DatabaseAutomationDependency["dependencyType"],
    dependencyId: string,
    usage: string,
  ) => {
    const dependency = { dependencyId, dependencyType, usage };
    dependencies.set(`${dependencyType}:${dependencyId}:${usage}`, dependency);
  };
  const addError = (
    code: string,
    message: string,
    path: Array<string | number>,
  ) => errors.push({ code, message, path });

  addDependency("data_source", context.sourceDataSourceId, "source");
  addDependency("database", context.parentDatabaseId, "source.parentDatabase");
  validateTimezone(definition.timezone, ["timezone"], addError);

  if (definition.scope.type === "view") {
    const view = context.views.get(definition.scope.viewId);
    if (!view || view.dataSourceId !== context.sourceDataSourceId) {
      addError("invalid_view_scope", "The selected view does not belong to this data source", ["scope", "viewId"]);
    } else {
      addDependency("view", view.id, "scope.viewId");
    }
  }

  const sourceProperties = context.propertiesByDataSource.get(context.sourceDataSourceId) ?? new Map();
  visitFormulaExpressions(definition, (expression, path) => {
    try {
      new FormulaParser(tokenizeFormula(expression)).parse();
    } catch (error) {
      addError(
        "invalid_formula",
        error instanceof Error ? error.message : "Formula is invalid",
        path,
      );
    }
  });
  if (definition.trigger.kind === "schedule") {
    if (!capabilities.schedules) {
      addError("capability_disabled", "Scheduled automations are not enabled", ["trigger"]);
    }
    validateTimezone(definition.trigger.schedule.timezone, ["trigger", "schedule", "timezone"], addError);
  } else {
    definition.trigger.clauses.forEach((clause, clauseIndex) => {
      if (clause.type === "page_added") return;
      const path = ["trigger", "clauses", clauseIndex] as Array<string | number>;
      if (clause.propertyId === "any") {
        if (clause.operator !== "was_edited") {
          addError("invalid_operator", "Any-property triggers only support was edited", [...path, "operator"]);
        }
        return;
      }
      const property = clause.propertyId === "name"
        ? { dataSourceId: context.sourceDataSourceId, id: "name", name: "Name", options: [], type: "title", writable: true }
        : sourceProperties.get(clause.propertyId);
      if (!property) {
        addError("property_not_found", "Trigger property was not found", [...path, "propertyId"]);
        return;
      }
      propertyTypes[property.id] = property.type;
      if (property.id !== "name") addDependency("property", property.id, `trigger.clauses.${clause.id}.propertyId`);
      if (!operatorsForPropertyType(property.type).has(clause.operator)) {
        addError("invalid_operator", `Operator ${clause.operator} is not valid for ${property.type}`, [...path, "operator"]);
      }
      if (!operandlessOperators.has(clause.operator) && clause.operand === undefined) {
        addError("operand_required", "This trigger operator requires an operand", [...path, "operand"]);
      }
      if (operandlessOperators.has(clause.operator) && clause.operand !== undefined) {
        addError("operand_not_allowed", "This trigger operator does not accept an operand", [...path, "operand"]);
      }
      validateTriggerOperand(property.type, clause.operator, clause.operand, [...path, "operand"], addError);
      validateOptionReferences(
        clause.operand,
        property,
        [...path, "operand"],
        `trigger.clauses.${clause.id}.operand`,
        addDependency,
        addError,
      );
    });
  }

  const declaredVariables = new Set<string>();
  const completedActions = new Set<string>();
  definition.actions.forEach((action, actionIndex) => {
    const actionPath = ["actions", actionIndex] as Array<string | number>;
    visitReferences(action, (reference, path) => {
      if (reference.reference === "variable" && !declaredVariables.has(reference.name)) {
        addError("variable_not_available", `Variable ${reference.name} is not available yet`, [...actionPath, ...path]);
      }
      if (reference.reference === "action_output" && !completedActions.has(reference.actionId)) {
        addError("action_output_not_available", "Action output must reference an earlier action", [...actionPath, ...path]);
      }
      if (reference.reference === "trigger_property") {
        const property = sourceProperties.get(reference.propertyId);
        if (!property) addError("property_not_found", "Referenced property was not found", [...actionPath, ...path, "propertyId"]);
        else addDependency("property", property.id, `actions.${action.id}.reference`);
      }
      if (reference.reference === "selected_person") addDependency("user", reference.userId, `actions.${action.id}.reference`);
      if (reference.reference === "selected_group") addDependency("group", reference.groupId, `actions.${action.id}.reference`);
    });

    if (action.type === "define_variables") {
      for (const variable of action.variables) declaredVariables.add(variable.name);
    } else if (action.type === "edit_trigger_page") {
      validateOperations(action.operations, sourceProperties, actionPath, action.id, addDependency, addError, propertyTypes);
    } else if (action.type === "add_page") {
      validateTargetOperations(action.dataSourceId, action.operations, actionPath, action.id, context, addDependency, addError, propertyTypes);
    } else if (action.type === "edit_pages") {
      let targetDataSourceId = action.target.type === "filtered_data_source"
        ? action.target.dataSourceId
        : context.sourceDataSourceId;
      if (action.target.type === "related_pages") {
        const relation = sourceProperties.get(action.target.propertyId);
        if (!relation || relation.type !== "relation") {
          addError("invalid_relation", "Related-pages target requires a relation property", [...actionPath, "target", "propertyId"]);
        } else {
          addDependency("property", relation.id, `actions.${action.id}.target.propertyId`);
          if (!relation.relatedDataSourceId) {
            addError("invalid_relation", "Relation target data source is unavailable", [...actionPath, "target", "propertyId"]);
          } else targetDataSourceId = relation.relatedDataSourceId;
        }
      }
      if (action.target.type === "filtered_data_source") {
        validateFilterDefinition(
          action.target.filter,
          context.propertiesByDataSource.get(action.target.dataSourceId) ?? new Map(),
          [...actionPath, "target", "filter"],
          action.id,
          addDependency,
          addError,
          propertyTypes,
        );
      }
      validateTargetOperations(targetDataSourceId, action.operations, actionPath, action.id, context, addDependency, addError, propertyTypes);
    } else if (action.type === "send_notification") {
      action.recipients.forEach((recipient, recipientIndex) => {
        if (recipient.type === "person_property") {
          const property = sourceProperties.get(recipient.propertyId);
          if (!property || property.type !== "person") {
            addError("invalid_recipient_property", "Notification recipient must use a person property", [...actionPath, "recipients", recipientIndex, "propertyId"]);
          } else addDependency("property", property.id, `actions.${action.id}.recipients.${recipientIndex}`);
        }
        if (recipient.type === "selected_user") {
          addDependency("user", recipient.userId, `actions.${action.id}.recipients.${recipientIndex}`);
          if (context.userIds && !context.userIds.has(recipient.userId)) {
            addError("recipient_not_found", "Selected notification recipient is not an active workspace member", [...actionPath, "recipients", recipientIndex, "userId"]);
          }
        }
        if (recipient.type === "variable" && !declaredVariables.has(recipient.variableName)) {
          addError("variable_not_available", `Variable ${recipient.variableName} is not available yet`, [...actionPath, "recipients", recipientIndex, "variableName"]);
        }
      });
      if (!capabilities.notifications) addError("capability_disabled", "Notifications are not enabled", actionPath);
    } else if (action.type === "send_gmail") {
      addDependency("gmail_connection", action.connectionId, `actions.${action.id}.connectionId`);
      if (context.gmailConnectionIds && !context.gmailConnectionIds.has(action.connectionId)) {
        addError("gmail_connection_not_owned", "Choose a connected Gmail account that you own in this workspace", [...actionPath, "connectionId"]);
      }
      if (!capabilities.gmail) addError("capability_disabled", "Gmail actions are not enabled", actionPath);
    } else if (action.type === "send_webhook") {
      if (definition.trigger.kind === "schedule" && action.selectedPropertyIds.length) {
        addError("scheduled_trigger_page_unavailable", "Scheduled webhooks cannot include trigger-page properties", [...actionPath, "selectedPropertyIds"]);
      }
      if (context.invalidWebhookActionIds?.has(action.id)) {
        addError("invalid_webhook_destination", "Webhook destination could not be verified as public", [...actionPath, "url"]);
      }
      const headerNames = new Set<string>();
      action.headers.forEach((header, headerIndex) => {
        addDependency("secret", header.secretId, `actions.${action.id}.headers`);
        const normalizedName = header.name.trim().toLowerCase();
        if (!/^[!#$%&'*+.^_`|~0-9a-z-]{1,200}$/.test(normalizedName) || [
          "connection", "content-length", "content-type", "host", "keep-alive",
          "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding",
          "upgrade", "x-zilobase-action-id", "x-zilobase-delivery-id", "x-zilobase-run-id",
          "x-zilobase-schema-version",
        ].includes(normalizedName)) {
          addError("invalid_webhook_header", "Webhook header is reserved or invalid", [...actionPath, "headers", headerIndex, "name"]);
        }
        if (headerNames.has(normalizedName)) addError("duplicate_webhook_header", "Webhook header names must be unique", [...actionPath, "headers", headerIndex, "name"]);
        headerNames.add(normalizedName);
        if (context.secretIds && !context.secretIds.has(header.secretId)) {
          addError("webhook_secret_not_owned", "Webhook header secret is unavailable", [...actionPath, "headers", headerIndex, "secretId"]);
        }
      });
      try {
        const url = new URL(action.url);
        const httpAllowed = url.protocol === "http:" && context.allowHttpWebhookDomains?.has(url.hostname.toLowerCase());
        if ((url.protocol !== "https:" && !httpAllowed) || url.username || url.password || url.hash) {
          addError("invalid_webhook_url", "Webhook URL must be HTTPS without credentials or a fragment", [...actionPath, "url"]);
        }
      } catch {
        addError("invalid_webhook_url", "Webhook URL is invalid", [...actionPath, "url"]);
      }
      action.selectedPropertyIds.forEach((propertyId, propertyIndex) => {
        if (propertyId === "name") return;
        const property = sourceProperties.get(propertyId);
        if (!property) addError("property_not_found", "Webhook property was not found", [...actionPath, "selectedPropertyIds", propertyIndex]);
        else addDependency("property", property.id, `actions.${action.id}.selectedPropertyIds.${propertyIndex}`);
      });
      if (!capabilities.webhooks) addError("capability_disabled", "Webhook actions are not enabled", actionPath);
    } else if (action.type === "send_slack") {
      addDependency("slack_connection", action.connectionId, `actions.${action.id}.connectionId`);
      if (action.channelId.startsWith("D")) addError("slack_direct_message_forbidden", "Slack direct messages are not supported", [...actionPath, "channelId"]);
      if (context.slackConnectionIds && !context.slackConnectionIds.has(action.connectionId)) {
        addError("slack_connection_not_owned", "Slack connection is unavailable", [...actionPath, "connectionId"]);
      }
      action.message.parts.forEach((part, partIndex) => {
        if (part.type === "value" && part.value.type === "formula") {
          addError("slack_formula_requires_variable", "Slack formulas must be defined as variables first", [...actionPath, "message", "parts", partIndex]);
        }
      });
      if (!capabilities.slack) addError("capability_disabled", "Slack actions are not enabled", actionPath);
    }
    completedActions.add(action.id);
  });

  if (errors.length > 0) return { compiledDefinition: null, definition, definitionHash: null, validation: { errors, valid: false, warnings } };

  const compiledDefinition: CompiledDatabaseAutomationDefinition = {
    compilerVersion: 1,
    definition,
    dependencies: [...dependencies.values()],
    propertyTypes,
  };
  return {
    compiledDefinition,
    definition,
    definitionHash: createHash("sha256").update(stableJson(definition)).digest("hex"),
    validation: { errors, valid: true, warnings },
  };
}

export function operatorsForPropertyType(type: string) {
  if (["email", "phone", "place", "text", "title", "url"].includes(type)) return textOperators;
  if (type === "number") return numberOperators;
  if (["select", "status"].includes(type)) return choiceOperators;
  if (["multi_select", "person", "relation"].includes(type)) return collectionOperators;
  if (type === "date") return dateOperators;
  if (["checkbox", "verification"].includes(type)) return checkboxOperators;
  if (type === "files") return filesOperators;
  return new Set<DatabaseAutomationTriggerOperator>();
}

function validateTriggerOperand(
  propertyType: string,
  operator: DatabaseAutomationTriggerOperator,
  operand: unknown,
  path: Array<string | number>,
  addError: (code: string, message: string, path: Array<string | number>) => void,
) {
  if (operandlessOperators.has(operator) || operand === undefined) return;
  let valid = true;
  if (["email", "phone", "place", "text", "title", "url"].includes(propertyType)) {
    valid = typeof operand === "string";
  } else if (propertyType === "number") {
    valid = typeof operand === "number" && Number.isFinite(operand);
  } else if (["select", "status", "multi_select"].includes(propertyType)) {
    valid = isEntityOperand(operand, "option");
  } else if (propertyType === "person") {
    valid = isEntityOperand(operand, "user");
  } else if (propertyType === "relation") {
    valid = isEntityOperand(operand, "page");
  } else if (propertyType === "date") {
    valid = operator === "is_between"
      ? isObjectType(operand, "date_range")
      : operator === "is_relative_to_today"
        ? isObjectType(operand, "relative_date")
        : isObjectType(operand, "date");
  }
  if (!valid) addError("invalid_operand", `Operand is not valid for ${propertyType}`, path);
}

function isEntityOperand(value: unknown, entityType: string) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    entityType?: unknown;
    ids?: unknown;
    type?: unknown;
  };
  if (candidate.entityType !== entityType) return false;
  if (candidate.type === "entity") return true;
  return candidate.type === "entity_list" &&
    Array.isArray(candidate.ids) &&
    candidate.ids.length > 0 &&
    candidate.ids.every((id) => typeof id === "string" && id.trim());
}

function isObjectType(value: unknown, type: string) {
  return Boolean(value && typeof value === "object" && (value as { type?: unknown }).type === type);
}

function validateTargetOperations(
  dataSourceId: string,
  operations: DatabaseAutomationDefinition["actions"][number] extends infer _ ? Array<{ mode: "set" | "add" | "remove" | "clear"; propertyId: string; value?: unknown }> : never,
  actionPath: Array<string | number>,
  actionId: string,
  context: DatabaseAutomationCompilationContext,
  addDependency: (type: DatabaseAutomationDependency["dependencyType"], id: string, usage: string) => void,
  addError: (code: string, message: string, path: Array<string | number>) => void,
  propertyTypes: Record<string, string>,
) {
  if (!context.dataSourceIds.has(dataSourceId)) {
    addError("target_forbidden", "Target data source is unavailable or not editable", [...actionPath, "dataSourceId"]);
    return;
  }
  addDependency("data_source", dataSourceId, `actions.${actionId}.dataSourceId`);
  validateOperations(
    operations,
    context.propertiesByDataSource.get(dataSourceId) ?? new Map(),
    actionPath,
    actionId,
    addDependency,
    addError,
    propertyTypes,
  );
}

function validateOperations(
  operations: Array<{ mode: "set" | "add" | "remove" | "clear"; propertyId: string; value?: unknown }>,
  properties: Map<string, AutomationPropertyMetadata>,
  actionPath: Array<string | number>,
  actionId: string,
  addDependency: (type: DatabaseAutomationDependency["dependencyType"], id: string, usage: string) => void,
  addError: (code: string, message: string, path: Array<string | number>) => void,
  propertyTypes: Record<string, string>,
) {
  operations.forEach((operation, operationIndex) => {
    const path = [...actionPath, "operations", operationIndex];
    const property = operation.propertyId === "name"
      ? { dataSourceId: "", id: "name", name: "Name", options: [], type: "title", writable: true }
      : properties.get(operation.propertyId);
    if (!property) {
      addError("property_not_found", "Action property was not found", [...path, "propertyId"]);
      return;
    }
    if (!property.writable || derivedPropertyTypes.has(property.type)) {
      addError("property_read_only", "This property cannot be edited", [...path, "propertyId"]);
      return;
    }
    propertyTypes[property.id] = property.type;
    if (property.id !== "name") addDependency("property", property.id, `actions.${actionId}.operations.${operationIndex}`);
    const validModes = collectionPropertyTypes.has(property.type)
      ? new Set(["set", "add", "remove", "clear"])
      : property.type === "files"
        ? new Set(["clear"])
        : scalarPropertyTypes.has(property.type)
          ? new Set(["set", "clear"])
          : new Set<string>();
    if (!validModes.has(operation.mode)) {
      addError("invalid_operation", `${operation.mode} is not valid for ${property.type}`, [...path, "mode"]);
    }
    if (
      ["select", "status", "multi_select"].includes(property.type) &&
      operation.mode !== "clear" &&
      isObjectType(operation.value, "literal") &&
      optionReferenceIds(operation.value).length === 0
    ) {
      addError(
        "invalid_option_value",
        "Choose an available property option",
        [...path, "value"],
      );
    }
    validateOptionReferences(
      operation.value,
      property,
      [...path, "value"],
      `actions.${actionId}.operations.${operationIndex}.value`,
      addDependency,
      addError,
    );
  });
}

function validateFilterDefinition(
  filter: AutomationFilterDefinition,
  properties: Map<string, AutomationPropertyMetadata>,
  path: Array<string | number>,
  actionId: string,
  addDependency: (type: DatabaseAutomationDependency["dependencyType"], id: string, usage: string) => void,
  addError: (code: string, message: string, path: Array<string | number>) => void,
  propertyTypes: Record<string, string>,
) {
  filter.conditions.forEach((condition, index) => {
    const conditionPath = [...path, "conditions", index];
    if ("conditions" in condition) {
      validateFilterDefinition(condition, properties, conditionPath, actionId, addDependency, addError, propertyTypes);
      return;
    }
    const property = condition.propertyId === "name"
      ? { dataSourceId: "", id: "name", name: "Name", options: [], type: "title", writable: true }
      : properties.get(condition.propertyId);
    if (!property) {
      addError("property_not_found", "Filter property was not found", [...conditionPath, "propertyId"]);
      return;
    }
    propertyTypes[property.id] = property.type;
    if (property.id !== "name") addDependency("property", property.id, `actions.${actionId}.filter.${condition.id}`);
    if (!operatorsForPropertyType(property.type).has(condition.operator)) {
      addError("invalid_operator", `Operator ${condition.operator} is not valid for ${property.type}`, [...conditionPath, "operator"]);
    }
    if (!operandlessOperators.has(condition.operator) && condition.operand === undefined) {
      addError("operand_required", "This filter operator requires an operand", [...conditionPath, "operand"]);
    }
    if (operandlessOperators.has(condition.operator) && condition.operand !== undefined) {
      addError("operand_not_allowed", "This filter operator does not accept an operand", [...conditionPath, "operand"]);
    }
    validateTriggerOperand(
      property.type,
      condition.operator,
      condition.operand,
      [...conditionPath, "operand"],
      addError,
    );
    validateOptionReferences(
      condition.operand,
      property,
      [...conditionPath, "operand"],
      `actions.${actionId}.filter.${condition.id}.operand`,
      addDependency,
      addError,
    );
  });
}

function validateOptionReferences(
  value: unknown,
  property: AutomationPropertyMetadata,
  path: Array<string | number>,
  usage: string,
  addDependency: (type: DatabaseAutomationDependency["dependencyType"], id: string, usage: string) => void,
  addError: (code: string, message: string, path: Array<string | number>) => void,
) {
  if (!["select", "status", "multi_select"].includes(property.type)) return;
  const availableOptionIds = new Set((property.options ?? []).map(({ id }) => id));
  for (const optionId of optionReferenceIds(value)) {
    if (!availableOptionIds.has(optionId)) {
      addError("option_not_found", "Selected option was deleted or is no longer available", path);
      continue;
    }
    addDependency("option", optionId, usage);
  }
}

function optionReferenceIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(optionReferenceIds))];
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.entityType === "option" && record.type === "entity" && typeof record.id === "string") {
    return [record.id];
  }
  if (record.entityType === "option" && record.type === "entity_list" && Array.isArray(record.ids)) {
    return [...new Set(record.ids.filter((id): id is string => typeof id === "string"))];
  }
  return Object.values(record).flatMap(optionReferenceIds);
}

function visitReferences(
  value: unknown,
  visitor: (reference: AutomationReference, path: Array<string | number>) => void,
  path: Array<string | number> = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitReferences(item, visitor, [...path, index]));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "reference" && typeof record.reference === "string") {
    visitor(record as AutomationReference, path);
  }
  for (const [key, item] of Object.entries(record)) visitReferences(item, visitor, [...path, key]);
}

function visitFormulaExpressions(
  value: unknown,
  visitor: (expression: string, path: Array<string | number>) => void,
  path: Array<string | number> = [],
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitFormulaExpressions(item, visitor, [...path, index]));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "formula" && typeof record.expression === "string") {
    visitor(record.expression, [...path, "expression"]);
  }
  for (const [key, item] of Object.entries(record)) {
    visitFormulaExpressions(item, visitor, [...path, key]);
  }
}

function validateTimezone(
  timezone: string,
  path: Array<string | number>,
  addError: (code: string, message: string, path: Array<string | number>) => void,
) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    addError("invalid_timezone", "Timezone must be a valid IANA timezone", path);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function invalidResult(errors: DatabaseAutomationValidationError[]): DatabaseAutomationCompilationResult {
  return {
    compiledDefinition: null,
    definition: null,
    definitionHash: null,
    validation: { errors, valid: false, warnings: [] },
  };
}
