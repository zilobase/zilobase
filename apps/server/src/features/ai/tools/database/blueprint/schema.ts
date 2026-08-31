import {
  AGENT_ICON_COLORS,
  AGENT_ICON_NAMES,
} from "@zilobase/features/ai-chat/live-agent";
import * as z from "zod";

export const AGENT_CREATABLE_DATABASE_PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "person",
  "files",
  "checkbox",
  "url",
  "phone",
  "email",
  "relation",
  "id",
  "place",
  "verification",
  "created_time",
  "edited_time",
] as const;

export const AGENT_DATABASE_VIEW_TYPES = [
  "table",
  "kanban",
  "timeline",
  "chart",
  "gallery",
  "list",
  "form",
] as const;

export const agentCreatableDatabasePropertyTypeSchema = z.enum(
  AGENT_CREATABLE_DATABASE_PROPERTY_TYPES,
);
export const agentDatabaseViewTypeSchema = z.enum(AGENT_DATABASE_VIEW_TYPES);
export const agentIconSchema = z.object({
  color: z.enum(AGENT_ICON_COLORS),
  name: z.enum(AGENT_ICON_NAMES),
});
export const agentGlyphSchema = z.enum(AGENT_ICON_NAMES);

const databaseFilterOperatorSchema = z.enum([
  "is",
  "is_not",
  "contains",
  "does_not_contain",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "is_before",
  "is_after",
  "is_on_or_before",
  "is_on_or_after",
  "is_between",
  "is_relative_to_today",
  "is_empty",
  "is_not_empty",
]);

const selectOptionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  color: z.string().trim().optional(),
  group: z.string().trim().optional(),
});

export const propertyConfigSchema = z
  .object({
    defaultOptionId: z.string().trim().optional(),
    options: z.array(selectOptionSchema).optional(),
    groupPropertyId: z.string().trim().optional(),
    hiddenPropertyIds: z.array(z.string()).optional(),
    filters: z.array(z.record(z.string(), z.unknown())).optional(),
    sorts: z.array(z.record(z.string(), z.unknown())).optional(),
    conditionalColors: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough()
  .optional();

const databaseBlueprintPropertySchema = z.object({
  config: propertyConfigSchema,
  icon: agentGlyphSchema.optional(),
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  name: z.string().trim().min(1).max(120),
  type: agentCreatableDatabasePropertyTypeSchema,
});

const databaseBlueprintViewSchema = z.object({
  filters: z.array(z.object({
    joinOperator: z.enum(["and", "or"]).optional(),
    operator: databaseFilterOperatorSchema,
    property: z.string().trim().min(1).max(120),
    values: z.array(z.string().max(1_000)).max(10).default([]),
  })).max(20).optional(),
  groupBy: z.string().trim().min(1).max(120).optional(),
  icon: agentGlyphSchema.optional(),
  hiddenProperties: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  name: z.string().trim().min(1).max(120),
  sorts: z.array(z.object({
    direction: z.enum(["ascending", "descending"]),
    property: z.string().trim().min(1).max(120),
  })).max(10).optional(),
  timelineDateProperty: z.string().trim().min(1).max(120).optional(),
  type: agentDatabaseViewTypeSchema,
  useDefault: z.boolean().optional(),
});

export const databaseBlueprintSchema = z.object({
  databaseName: z.string().trim().min(1).max(240),
  hostPage: z.object({
    emoji: z.string().trim().max(32).optional(),
    icon: agentIconSchema.optional(),
    markdown: z.string().trim().max(64_000).optional(),
    name: z.string().trim().min(1).max(240),
    parentPageId: z.string().trim().min(1).optional(),
  }).refine((value) => !(value.emoji && value.icon), {
    message: "Choose either an emoji or a colored icon for the host page.",
  }).optional(),
  emoji: z.string().trim().max(32).optional(),
  icon: agentIconSchema.optional(),
  pageId: z.string().trim().min(1).optional(),
  placement: z.enum(["standalone", "inline"]),
  properties: z.array(databaseBlueprintPropertySchema).max(30).default([]),
  rows: z.array(z.object({
    markdown: z.string().trim().max(64_000).optional(),
    title: z.string().trim().min(1).max(240),
    values: z.record(z.string(), z.unknown()).default({}),
  })).max(50).default([]),
  showInlineDatabaseTitle: z.boolean().optional(),
  teamspaceId: z.string().trim().min(1).nullable().optional(),
  views: z.array(databaseBlueprintViewSchema).max(10).default([]),
}).refine(
  (value) => !(value.emoji && value.icon),
  { message: "Choose either an emoji or a colored icon for the database." },
).refine(
  (value) =>
    value.placement === "standalone" || Boolean(value.pageId || value.hostPage),
  { message: "Inline databases require pageId or hostPage." },
).refine(
  (value) =>
    value.placement === "inline" || (!value.pageId && !value.hostPage),
  { message: "Standalone databases must not include pageId or hostPage." },
).refine(
  (value) =>
    value.rows.reduce((total, row) => total + Object.keys(row.values).length, 0) <=
      500,
  { message: "A database blueprint can set at most 500 cell values." },
).superRefine((value, context) => {
  const references = new Set<string>();

  for (const [index, property] of value.properties.entries()) {
    const propertyReferences = new Map(
      [property.key, property.name].map((reference) => [
        reference.trim().toLowerCase(),
        reference,
      ]),
    );
    for (const [normalized, reference] of propertyReferences) {
      if (references.has(normalized)) {
        context.addIssue({
          code: "custom",
          message: `Property key and name references must be unique; “${reference}” is duplicated.`,
          path: ["properties", index],
        });
      }
      references.add(normalized);
    }
  }
});

export type DatabaseBlueprintInput = z.infer<typeof databaseBlueprintSchema>;
