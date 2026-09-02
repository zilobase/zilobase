import { describe, expect, it } from "vitest";

import type {
  AutomationTriggerOperand,
  DatabaseAutomationDefinition,
} from "@zilobase/features/databases/automations";
import { databaseAutomationTriggerOperators } from "@zilobase/features/databases/automations";
import {
  compileDatabaseAutomationDefinition,
  operatorsForPropertyType,
  type AutomationPropertyMetadata,
  type DatabaseAutomationCompilationContext,
} from "./compiler";

const properties = [
  ["text", "text"],
  ["number", "number"],
  ["select", "select"],
  ["multi", "multi_select"],
  ["person", "person"],
  ["relation", "relation"],
  ["date", "date"],
  ["checkbox", "checkbox"],
  ["files", "files"],
  ["formula", "formula"],
].map(([id, type]) => ({
  dataSourceId: "source-1",
  id,
  name: id,
  ...(["select", "multi_select"].includes(type)
    ? { options: [{ id: "option-1", name: "First" }, { id: "option-2", name: "Second" }] }
    : {}),
  type,
  writable: type !== "formula",
}) satisfies AutomationPropertyMetadata);

const context: DatabaseAutomationCompilationContext = {
  dataSourceIds: new Set(["source-1", "source-2"]),
  parentDatabaseId: "database-1",
  propertiesByDataSource: new Map([
    ["source-1", new Map(properties.map((property) => [property.id, property]))],
    ["source-2", new Map([
      ["target-text", {
        dataSourceId: "source-2",
        id: "target-text",
        name: "Target text",
        type: "text",
        writable: true,
      }],
    ])],
  ]),
  sourceDataSourceId: "source-1",
  views: new Map([["view-1", {
    dataSourceId: "source-1",
    id: "view-1",
    name: "Table",
    type: "table",
  }]]),
};

function definition(
  overrides: Partial<DatabaseAutomationDefinition> = {},
): DatabaseAutomationDefinition {
  return {
    actions: [{
      id: "action-1",
      operations: [{
        mode: "set",
        propertyId: "text",
        value: { type: "literal", value: "Done" },
      }],
      type: "edit_trigger_page",
    }],
    definitionVersion: 1,
    scope: { type: "data_source" },
    timezone: "UTC",
    trigger: {
      clauses: [{ id: "trigger-1", type: "page_added" }],
      kind: "event",
      match: "any",
    },
    ...overrides,
  } as DatabaseAutomationDefinition;
}

describe("database automation compiler", () => {
  it("compiles stable IDs, type metadata, dependencies, and a canonical hash", () => {
    const first = compileDatabaseAutomationDefinition(definition({
      scope: { type: "view", viewId: "view-1" },
    }), context);
    const second = compileDatabaseAutomationDefinition({
      ...definition({ scope: { type: "view", viewId: "view-1" } }),
      timezone: "UTC",
    }, context);

    expect(first.validation).toEqual({ errors: [], valid: true, warnings: [] });
    expect(first.definitionHash).toBe(second.definitionHash);
    expect(first.compiledDefinition?.propertyTypes).toEqual({ text: "text" });
    expect(first.compiledDefinition?.dependencies).toEqual(expect.arrayContaining([
      { dependencyId: "source-1", dependencyType: "data_source", usage: "source" },
      { dependencyId: "database-1", dependencyType: "database", usage: "source.parentDatabase" },
      { dependencyId: "view-1", dependencyType: "view", usage: "scope.viewId" },
      { dependencyId: "text", dependencyType: "property", usage: "actions.action-1.operations.0" },
    ]));
  });

  it("publishes the complete trigger operator matrix", () => {
    expect([...operatorsForPropertyType("text")]).toEqual([
      "was_edited", "is", "is_not", "contains", "does_not_contain",
      "starts_with", "ends_with", "is_empty", "is_not_empty",
    ]);
    expect([...operatorsForPropertyType("number")]).toContain("greater_than_or_equal");
    expect([...operatorsForPropertyType("select")]).not.toContain("contains");
    expect([...operatorsForPropertyType("multi_select")]).toContain("contains");
    expect([...operatorsForPropertyType("date")]).toContain("is_relative_to_today");
    expect([...operatorsForPropertyType("checkbox")]).toEqual([
      "was_edited", "is_checked", "is_unchecked",
    ]);
    expect([...operatorsForPropertyType("files")]).toEqual([
      "was_edited", "is_empty", "is_not_empty",
    ]);
    expect([...operatorsForPropertyType("formula")]).toEqual([]);
    expect([...operatorsForPropertyType("button")]).toEqual([]);
  });

  it("validates every property and trigger-operator pairing", () => {
    const operands: Record<string, AutomationTriggerOperand | undefined> = {
      checkbox: undefined,
      date: { precision: "date", type: "date", value: "2026-09-02T00:00:00.000Z" },
      files: undefined,
      formula: "x",
      multi_select: { entityType: "option", ids: ["option-1", "option-2"], type: "entity_list" },
      number: 4,
      person: { entityType: "user", id: "user-1", type: "entity" },
      relation: { entityType: "page", id: "page-1", type: "entity" },
      select: { entityType: "option", ids: ["option-1", "option-2"], type: "entity_list" },
      text: "value",
    };

    for (const property of properties) {
      const allowed = operatorsForPropertyType(property.type);
      for (const operator of databaseAutomationTriggerOperators) {
        const operand: AutomationTriggerOperand | undefined = ["was_edited", "is_empty", "is_not_empty", "is_checked", "is_unchecked"].includes(operator)
          ? undefined
          : operator === "is_between"
            ? { end: "2026-09-03T00:00:00.000Z", start: "2026-09-02T00:00:00.000Z", type: "date_range" }
            : operator === "is_relative_to_today"
              ? { amount: 0, direction: "this", type: "relative_date", unit: "day" }
              : operands[property.type];
        const result = compileDatabaseAutomationDefinition(definition({
          trigger: {
            clauses: [{
              id: "trigger-1",
              ...(operand === undefined ? {} : { operand }),
              operator,
              propertyId: property.id,
              type: "property_edited",
            }],
            kind: "event",
            match: "any",
          },
        }), context);
        const hasOperatorError = result.validation.errors.some(({ code }) =>
          code === "invalid_operator" || code === "invalid_operand" || code === "operand_required"
        );
        expect(hasOperatorError, `${property.type}/${operator}`).toBe(!allowed.has(operator));
      }
    }

    for (const operator of databaseAutomationTriggerOperators) {
      const result = compileDatabaseAutomationDefinition(definition({
        trigger: {
          clauses: [{ id: "trigger-any", operator, propertyId: "any", type: "property_edited" }],
          kind: "event",
          match: "any",
        },
      }), context);
      expect(result.validation.valid, `any/${operator}`).toBe(operator === "was_edited");
    }
  });

  it("returns stable field-addressed schema and semantic errors", () => {
    const result = compileDatabaseAutomationDefinition(definition({
      actions: [{
        id: "action-1",
        operations: [{ mode: "add", propertyId: "number", value: { type: "literal", value: 1 } }],
        type: "edit_trigger_page",
      }],
      timezone: "Not/AZone",
      trigger: {
        clauses: [{
          id: "trigger-1",
          operand: 2,
          operator: "contains",
          propertyId: "number",
          type: "property_edited",
        }],
        kind: "event",
        match: "all",
      },
    }), context);

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_timezone", path: ["timezone"] }),
      expect.objectContaining({ code: "invalid_operator", path: ["trigger", "clauses", 0, "operator"] }),
      expect.objectContaining({ code: "invalid_operation", path: ["actions", 0, "operations", 0, "mode"] }),
    ]));
    expect(result.compiledDefinition).toBeNull();
  });

  it("tracks existing option IDs and rejects deleted options", () => {
    const valid = compileDatabaseAutomationDefinition(definition({
      actions: [{
        id: "action-1",
        operations: [{
          mode: "set",
          propertyId: "select",
          value: { type: "literal", value: { entityType: "option", id: "option-1", type: "entity" } },
        }],
        type: "edit_trigger_page",
      }],
      trigger: {
        clauses: [{
          id: "trigger-1",
          operand: { entityType: "option", id: "option-2", type: "entity" },
          operator: "is",
          propertyId: "select",
          type: "property_edited",
        }],
        kind: "event",
        match: "any",
      },
    }), context);

    expect(valid.validation.valid).toBe(true);
    expect(valid.compiledDefinition?.dependencies).toEqual(expect.arrayContaining([
      { dependencyId: "option-1", dependencyType: "option", usage: "actions.action-1.operations.0.value" },
      { dependencyId: "option-2", dependencyType: "option", usage: "trigger.clauses.trigger-1.operand" },
    ]));

    const invalid = compileDatabaseAutomationDefinition(definition({
      actions: [{
        id: "action-1",
        operations: [{
          mode: "set",
          propertyId: "select",
          value: { type: "literal", value: { entityType: "option", id: "deleted-option", type: "entity" } },
        }],
        type: "edit_trigger_page",
      }],
    }), context);

    expect(invalid.validation.errors).toContainEqual(expect.objectContaining({
      code: "option_not_found",
      path: ["actions", 0, "operations", 0, "value"],
    }));
  });

  it("validates nested filters, relation targets, formulas, and reference order", () => {
    const result = compileDatabaseAutomationDefinition(definition({
      actions: [
        {
          id: "variables",
          type: "define_variables",
          variables: [{
            expression: { reference: "variable", name: "later", type: "reference" },
            name: "first",
          }],
        },
        {
          id: "edit",
          operations: [{ mode: "set", propertyId: "target-text", value: { expression: "if(", type: "formula" } }],
          target: {
            dataSourceId: "source-2",
            filter: {
              conditions: [{
                id: "condition-1",
                operand: "x",
                operator: "greater_than",
                propertyId: "target-text",
                type: "condition",
              }],
              match: "all",
            },
            type: "filtered_data_source",
          },
          type: "edit_pages",
        },
      ],
    }), context);

    expect(result.validation.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "variable_not_available",
      "invalid_formula",
      "invalid_operator",
    ]));
  });

  it("keeps future capabilities independently gated", () => {
    const scheduled = definition({
      trigger: {
        kind: "schedule",
        schedule: {
          frequency: "daily",
          interval: 1,
          localTime: "09:00",
          startDate: "2026-09-02",
          timezone: "UTC",
        },
      },
      actions: [{
        id: "add",
        dataSourceId: "source-2",
        operations: [{ mode: "set", propertyId: "target-text", value: { type: "literal", value: "x" } }],
        type: "add_page",
      }],
    });
    expect(compileDatabaseAutomationDefinition(scheduled, context).validation.errors)
      .toContainEqual(expect.objectContaining({ code: "capability_disabled", path: ["trigger"] }));
    expect(compileDatabaseAutomationDefinition(scheduled, {
      ...context,
      capabilities: { schedules: true },
    }).validation.valid).toBe(true);
  });

  it("requires Gmail actions to use a connected account owned by the editor", () => {
    const gmail = definition({
      actions: [{
        bcc: [],
        cc: [],
        connectionId: "gmail-1",
        id: "gmail-action",
        message: { parts: [{ text: "Body", type: "text" }] },
        subject: { parts: [{ text: "Subject", type: "text" }] },
        to: [{ type: "literal", value: "person@example.com" }],
        type: "send_gmail",
      }],
    });
    expect(compileDatabaseAutomationDefinition(gmail, {
      ...context,
      capabilities: { gmail: true },
      gmailConnectionIds: new Set(["gmail-2"]),
    }).validation.errors).toContainEqual(expect.objectContaining({
      code: "gmail_connection_not_owned",
      path: ["actions", 0, "connectionId"],
    }));
    expect(compileDatabaseAutomationDefinition(gmail, {
      ...context,
      capabilities: { gmail: true },
      gmailConnectionIds: new Set(["gmail-1"]),
    }).validation.valid).toBe(true);
  });

  it("validates webhook URLs, protected headers, and owned secret references", () => {
    const webhook = definition({ actions: [{
      headers: [{ name: "Authorization", secretId: "secret-1" }],
      id: "webhook-1",
      payloadFields: [],
      selectedPropertyIds: ["text"],
      type: "send_webhook",
      url: "https://hooks.example.com/automations",
    }] });
    expect(compileDatabaseAutomationDefinition(webhook, {
      ...context,
      capabilities: { webhooks: true },
      secretIds: new Set(["secret-1"]),
    }).validation.valid).toBe(true);
    expect(compileDatabaseAutomationDefinition({
      ...webhook,
      actions: [{ ...webhook.actions[0] as any, selectedPropertyIds: ["name"] }],
    }, {
      ...context,
      capabilities: { webhooks: true },
      secretIds: new Set(["secret-1"]),
    }).validation.valid).toBe(true);
    const invalid = compileDatabaseAutomationDefinition({
      ...webhook,
      actions: [{ ...webhook.actions[0] as any, headers: [{ name: "Host", secretId: "secret-other" }], url: "http://127.0.0.1/hook" }],
    }, {
      ...context,
      capabilities: { webhooks: true },
      invalidWebhookActionIds: new Set(["webhook-1"]),
      secretIds: new Set(["secret-1"]),
    });
    expect(invalid.validation.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "invalid_webhook_destination",
      "invalid_webhook_header",
      "invalid_webhook_url",
      "webhook_secret_not_owned",
    ]));
  });

  it("requires owned Slack connections, rejects DMs, and routes formulas through variables", () => {
    const slack = definition({ actions: [{
      channelId: "D123",
      connectionId: "slack-1",
      id: "slack-action",
      message: { parts: [{ type: "value", value: { expression: "1 + 1", type: "formula" } }] },
      type: "send_slack",
    }] });
    const invalid = compileDatabaseAutomationDefinition(slack, {
      ...context, capabilities: { slack: true }, slackConnectionIds: new Set(["slack-other"]),
    });
    expect(invalid.validation.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "slack_connection_not_owned", "slack_direct_message_forbidden", "slack_formula_requires_variable",
    ]));
    const valid = compileDatabaseAutomationDefinition({
      ...slack,
      actions: [{
        ...slack.actions[0] as any,
        channelId: "C123",
        message: { parts: [{ text: "Message", type: "text" }] },
      }],
    }, { ...context, capabilities: { slack: true }, slackConnectionIds: new Set(["slack-1"]) });
    expect(valid.validation.valid).toBe(true);
  });
});
