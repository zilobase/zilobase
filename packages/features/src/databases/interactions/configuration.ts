import { z } from "zod";

const key = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) => !["__proto__", "prototype", "constructor"].includes(value),
    "Unsafe configuration key",
  );
const path = z.array(key).min(1).max(12);
export const configurationChangeSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("set"), path, value: z.json() }).strict(),
  z.object({ operation: z.literal("remove"), path }).strict(),
]);
export const configurationChangesSchema = z.array(configurationChangeSchema).max(256);
export type ConfigurationChange = z.infer<typeof configurationChangeSchema>;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Immutable field-level updates. Arrays are field values, never numeric paths. */
export function applyConfigurationChanges(value: unknown, changes: readonly ConfigurationChange[]) {
  const result = { ...object(value) };
  for (const change of configurationChangesSchema.parse(changes)) {
    let target = result;
    for (const segment of change.path.slice(0, -1)) {
      const child = { ...object(target[segment]) };
      target[segment] = child;
      target = child;
    }
    const field = change.path.at(-1)!;
    if (change.operation === "remove") delete target[field];
    else target[field] = structuredClone(change.value);
  }
  return result;
}

/** For full editor drafts only: capture the exact fields changed at submission. */
export function diffConfiguration(previous: unknown, next: unknown): ConfigurationChange[] {
  const changes: ConfigurationChange[] = [];
  const visit = (
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    path: string[],
  ) => {
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const nextPath = [...path, field];
      if (!(field in after) || after[field] === undefined) {
        if (before[field] !== undefined) changes.push({ operation: "remove", path: nextPath });
      } else if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
        const value = after[field];
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          before[field] !== null &&
          typeof before[field] === "object" &&
          !Array.isArray(before[field])
        )
          visit(object(before[field]), object(value), nextPath);
        else
          changes.push({
            operation: "set",
            path: nextPath,
            value: z.json().parse(omitUndefinedFields(value)),
          });
      }
    }
  };
  visit(object(previous), object(next), []);
  return configurationChangesSchema.parse(changes);
}

/** Editor drafts may contain optional fields; the wire contract is strict JSON. */
function omitUndefinedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefinedFields);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== undefined)
        .map(([key, field]) => [key, omitUndefinedFields(field)]),
    );
  return value;
}
