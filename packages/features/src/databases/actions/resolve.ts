import type { DatabasePropertyEntity } from "../core/entities";
import { FormulaParser } from "../schema/formula/parser";
import { tokenizeFormula } from "../schema/formula/tokenizer";
import { isReadOnlyPropertyType } from "../schema/property-types";
import { serializePropertyValue, type DatabasePropertyValue } from "../schema/property-values";
import type { DatabasePropertyConfig } from "../views/configuration";
import type { CellValueInput, PropertyConfigInput } from "./schemas";

/** A resolution failure the model can correct; `candidates` lists valid choices. */
export class ActionInputError extends Error {
  constructor(
    message: string,
    readonly candidates: string[] = [],
  ) {
    super(candidates.length ? `${message} Valid choices: ${candidates.join(", ")}.` : message);
    this.name = "ActionInputError";
  }
}

const normalized = (value: string) => value.trim().toLowerCase();

/** Resolves a property by column ID, page property ID or (case-insensitive) name. */
export function resolveProperty(
  properties: DatabasePropertyEntity[],
  reference: string,
): DatabasePropertyEntity {
  const exact = properties.find(
    (property) => property.id === reference || property.property.id === reference,
  );
  if (exact) return exact;
  const named = properties.filter(
    (property) => normalized(property.property.name) === normalized(reference),
  );
  if (named.length === 1) return named[0]!;
  const names = properties.map((property) => property.property.name);
  if (named.length > 1)
    throw new ActionInputError(
      `Several properties are named "${reference}"; use an ID.`,
      named.map((property) => property.id),
    );
  throw new ActionInputError(`Unknown property "${reference}".`, names);
}

/** Like resolveProperty, but "name" refers to the title column. */
export function resolveColumnId(properties: DatabasePropertyEntity[], reference: string) {
  return normalized(reference) === "name" || normalized(reference) === "title"
    ? "name"
    : resolveProperty(properties, reference).id;
}

function optionNames(config: unknown) {
  const options = (config as { options?: Array<{ name?: unknown }> } | null)?.options;
  return Array.isArray(options)
    ? options.flatMap((option) => (typeof option.name === "string" ? [option.name] : []))
    : [];
}

function matchOption(property: DatabasePropertyEntity, value: string) {
  const names = optionNames(property.property.config);
  const match = names.find((name) => normalized(name) === normalized(value));
  if (match) return match;
  throw new ActionInputError(
    `"${value}" is not an option of ${property.property.name}. Add it to the property first.`,
    names,
  );
}

/** Serializes a model value exactly like the cell editors do. */
export function resolveCellValue(property: DatabasePropertyEntity, value: CellValueInput) {
  const { type } = property.property;
  if (isReadOnlyPropertyType(type) || ["formula", "rollup", "button", "id"].includes(type))
    throw new ActionInputError(`${property.property.name} is computed and cannot be edited.`);
  if (value === null) return serializePropertyValue(type, type === "multi_select" ? [] : "");
  let cell: DatabasePropertyValue;
  if (type === "select" || type === "status") cell = matchOption(property, String(value));
  else if (type === "multi_select")
    cell = (Array.isArray(value) ? value : [String(value)]).map((item) =>
      matchOption(property, item),
    );
  else if (type === "checkbox") cell = value === true || value === "true" ? "true" : "false";
  else if (type === "date") {
    if (typeof value === "object" && !Array.isArray(value))
      cell = value.end ? [value.start, value.end] : value.start;
    else cell = Array.isArray(value) ? value.slice(0, 2) : String(value);
  } else if (Array.isArray(value)) cell = value;
  else cell = String(value);
  return serializePropertyValue(type, cell);
}

export function validateFormula(expression: string) {
  try {
    new FormulaParser(tokenizeFormula(expression)).parse();
  } catch (error) {
    throw new ActionInputError(
      `Invalid formula: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Converts a typed configuration into the stored property configuration patch. */
export function resolvePropertyConfig(
  properties: DatabasePropertyEntity[],
  input: PropertyConfigInput | undefined,
  currentConfig?: unknown,
): DatabasePropertyConfig | undefined {
  if (!input) return undefined;
  const config: DatabasePropertyConfig = {};
  if (input.options) {
    const existing = ((currentConfig as DatabasePropertyConfig | null)?.options ?? []).filter(
      (option) => typeof option?.name === "string",
    );
    config.options = input.options.map((option) => {
      const kept = existing.find((current) => normalized(current.name) === normalized(option.name));
      return {
        ...kept,
        id: kept?.id ?? option.name,
        name: option.name,
        ...(option.color ? { color: option.color } : {}),
      };
    });
  }
  if (input.numberFormat) config.numberFormat = input.numberFormat;
  if (input.dateFormat) config.dateFormat = input.dateFormat;
  if (input.formula !== undefined) {
    validateFormula(input.formula);
    config.formula = input.formula;
  }
  if (input.relation)
    config.relation = {
      relatedDatabaseId: input.relation.relatedDatabaseId,
      ...(input.relation.limit ? { limit: input.relation.limit } : {}),
      ...(input.relation.twoWayRelation !== undefined
        ? { twoWayRelation: input.relation.twoWayRelation }
        : {}),
      ...(input.relation.relatedPropertyName
        ? { relatedPropertyName: input.relation.relatedPropertyName }
        : {}),
    };
  if (input.rollup)
    config.rollup = {
      calculation: input.rollup.calculation,
      relationPropertyId: resolveProperty(properties, input.rollup.relationProperty).property.id,
      targetPropertyId: input.rollup.targetProperty,
    };
  return config;
}
