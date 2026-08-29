import type { AgentToolResult } from "@zilobase/features/ai-chat/agent-contract";
import { tool, type ToolSet } from "ai";
import * as z from "zod";

const cellSchema = z.union([z.string().max(4_000), z.number(), z.boolean(), z.null()]);
const tableSchema = z.object({
  columns: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  rows: z.array(z.array(cellSchema).max(50)).max(2_000),
});
const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("describe") }),
  z.object({
    column: z.string().trim().min(1),
    kind: z.enum(["sum", "average", "minimum", "maximum", "count"]),
  }),
  z.object({
    aggregate: z.enum(["sum", "average", "count"]),
    groupBy: z.string().trim().min(1),
    kind: z.literal("group"),
    valueColumn: z.string().trim().min(1).optional(),
  }),
]);

export function buildAnalysisTools(): ToolSet {
  return {
    analyzeDataTable: tool({
      description:
        "Run a deterministic, bounded calculation over a supplied table without arbitrary code, filesystem access, network access, or workspace credentials. Supports describe, numeric aggregates, counts, and grouped aggregates. Returns an interactive result table.",
      inputSchema: z.object({
        operation: operationSchema,
        table: tableSchema,
      }),
      execute: (input) => analyzeDataTable(input),
    }),
  };
}

export function analyzeDataTable(input: z.infer<z.ZodObject<{
  operation: typeof operationSchema;
  table: typeof tableSchema;
}>>): AgentToolResult<{ table: {
  columns: Array<{ id: string; label: string; type: string }>;
  rows: Array<{ cells: Record<string, string>; id: string }>;
} }> {
  const width = input.table.columns.length;
  const rows = input.table.rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? null),
  );

  if (input.operation.kind === "describe") {
    const resultRows = input.table.columns.map((column, index) => {
      const values = rows.map((row) => row[index]);
      const numeric = values.flatMap((value) => {
        const number = typeof value === "number" ? value : Number(value);
        return Number.isFinite(number) ? [number] : [];
      });
      return {
        cells: {
          column,
          count: String(values.filter((value) => value !== null && value !== "").length),
          maximum: numeric.length ? String(Math.max(...numeric)) : "",
          mean: numeric.length ? String(numeric.reduce((sum, value) => sum + value, 0) / numeric.length) : "",
          minimum: numeric.length ? String(Math.min(...numeric)) : "",
          numericCount: String(numeric.length),
        },
        id: `describe-${index}`,
      };
    });
    return success("Calculated column summaries.", [
      column("column", "Column", "text"),
      column("count", "Count", "number"),
      column("numericCount", "Numeric count", "number"),
      column("minimum", "Minimum", "number"),
      column("maximum", "Maximum", "number"),
      column("mean", "Mean", "number"),
    ], resultRows);
  }

  if (input.operation.kind === "group") {
    const operation = input.operation;
    const groupIndex = requireColumn(input.table.columns, operation.groupBy);
    const valueIndex = operation.aggregate === "count"
      ? null
      : requireColumn(input.table.columns, operation.valueColumn ?? "");
    const groups = new Map<string, number[]>();
    rows.forEach((row) => {
      const key = String(row[groupIndex] ?? "");
      const values = groups.get(key) ?? [];
      if (valueIndex === null) values.push(1);
      else {
        const value = Number(row[valueIndex]);
        if (Number.isFinite(value)) values.push(value);
      }
      groups.set(key, values);
    });
    const resultRows = [...groups.entries()].map(([group, values], index) => ({
      cells: {
        group,
        value: String(aggregate(values, operation.aggregate)),
      },
      id: `group-${index}`,
    }));
    return success("Calculated grouped results.", [
      column("group", operation.groupBy, "text"),
      column("value", operation.aggregate, "number"),
    ], resultRows);
  }

  const index = requireColumn(input.table.columns, input.operation.column);
  const numeric = rows.flatMap((row) => {
    const value = Number(row[index]);
    return Number.isFinite(value) ? [value] : [];
  });
  const value = input.operation.kind === "count"
    ? rows.filter((row) => row[index] !== null && row[index] !== "").length
    : aggregate(numeric, input.operation.kind);
  return success(`Calculated ${input.operation.kind}.`, [
    column("operation", "Operation", "text"),
    column("column", "Column", "text"),
    column("value", "Value", "number"),
  ], [{
    cells: {
      column: input.operation.column,
      operation: input.operation.kind,
      value: String(value),
    },
    id: "result",
  }]);
}

function aggregate(values: number[], kind: "average" | "count" | "maximum" | "minimum" | "sum") {
  if (kind === "count") return values.length;
  if (values.length === 0) return 0;
  if (kind === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (kind === "average") return values.reduce((sum, value) => sum + value, 0) / values.length;
  return kind === "minimum" ? Math.min(...values) : Math.max(...values);
}

function requireColumn(columns: string[], name: string) {
  const index = columns.findIndex((column) => column === name);
  if (index === -1) throw new Error(`Column "${name}" was not found.`);
  return index;
}

function column(id: string, label: string, type: string) {
  return { id, label, type };
}

function success(
  summary: string,
  columns: Array<{ id: string; label: string; type: string }>,
  rows: Array<{ cells: Record<string, string>; id: string }>,
) {
  return {
    data: { table: { columns, rows } },
    ok: true,
    status: "succeeded" as const,
    summary,
  };
}
