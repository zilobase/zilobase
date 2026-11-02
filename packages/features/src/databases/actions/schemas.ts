import { z } from "zod";
import { databaseColorIds } from "../schema/color-ids";
import { databasePropertyFilterOperators } from "../schema/filter";
import { databasePropertyTypes } from "../schema/property-types";

/*
 * Typed, model-facing inputs for database actions. They describe the same
 * configuration the UI edits; resolvers translate names into IDs and values
 * into serialized cells, and the server still normalizes and validates them.
 */

const id = z.string().trim().min(1).max(128);
export const propertyRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('Property name, or its ID from describe_database. Use "name" for the title.');

export const databaseTargetSchema = z.object({
  databaseId: id.describe("Database ID (the host database)."),
  dataSourceId: id
    .optional()
    .describe("Data source ID when the database has several sources; defaults to the first."),
});

export const writablePropertyTypes = databasePropertyTypes.filter(
  (type) => !["verification", "created_time", "edited_time"].includes(type),
) as Exclude<
  (typeof databasePropertyTypes)[number],
  "verification" | "created_time" | "edited_time"
>[];
export const propertyTypeSchema = z.enum(writablePropertyTypes as [string, ...string[]]);

/** Number formats offered by the number property settings. */
export const numberFormats = [
  "number",
  "number_with_separators",
  "percent",
  ...["usd", "aud", "cad", "sgd", "eur", "gbp", "jpy", "rub", "inr", "krw", "cny", "brl"],
  ...["try", "idr", "chf", "hkd", "nzd", "sek", "nok", "mxn", "zar", "twd", "dkk", "pln"],
  ...["thb", "aed", "ars", "clp", "cop", "sar"],
] as const;

const optionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: z.enum(databaseColorIds).optional(),
  })
  .strict();

export const propertyConfigSchema = z
  .object({
    options: z
      .array(optionSchema)
      .max(100)
      .optional()
      .describe("Options for select, multi_select and status properties."),
    numberFormat: z.enum(numberFormats).optional(),
    dateFormat: z
      .enum(["full", "short", "month_day_year", "day_month_year", "year_month_day", "relative"])
      .optional(),
    formula: z
      .string()
      .max(4000)
      .optional()
      .describe('Notion-style formula expression; prop("Name") references properties.'),
    relation: z
      .object({
        relatedDatabaseId: id,
        limit: z.enum(["one_page", "no_limit"]).optional(),
        twoWayRelation: z.boolean().optional(),
        relatedPropertyName: z.string().trim().max(100).optional(),
      })
      .strict()
      .optional(),
    rollup: z
      .object({
        relationProperty: propertyRefSchema,
        targetProperty: propertyRefSchema,
        calculation: z.enum([
          "show_original",
          "count_all",
          "count_values",
          "count_unique",
          "count_empty",
          "count_not_empty",
          "percent_empty",
          "percent_not_empty",
          "sum",
          "average",
          "median",
          "min",
          "max",
          "range",
          "earliest_date",
          "latest_date",
          "date_range",
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PropertyConfigInput = z.infer<typeof propertyConfigSchema>;

/** A cell value: option names, ISO dates or {start,end}, user or page IDs, numbers, booleans or text. */
export const cellValueSchema = z.union([
  z.string().max(20_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(2_000)).max(500),
  z.object({ start: z.string().max(64), end: z.string().max(64).optional() }).strict(),
]);
export type CellValueInput = z.infer<typeof cellValueSchema>;

export const rowInputSchema = z
  .object({
    title: z.string().max(2_000).optional(),
    values: z
      .record(propertyRefSchema, cellValueSchema)
      .optional()
      .describe("Values keyed by property name or ID."),
  })
  .strict();

const filterOperators = databasePropertyFilterOperators.map(({ value }) => value) as [
  string,
  ...string[],
];
export const viewFilterSchema = z
  .object({
    property: propertyRefSchema,
    operator: z.enum(filterOperators),
    values: z.array(z.string().max(500)).max(50).default([]),
  })
  .strict();
export const viewSortSchema = z
  .object({ property: propertyRefSchema, direction: z.enum(["ascending", "descending"]) })
  .strict();

export const viewTypeSchema = z.enum([
  "table",
  "kanban",
  "timeline",
  "calendar",
  "chart",
  "gallery",
  "list",
  "form",
]);
