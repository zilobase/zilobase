import type { Env, RuntimeEnv } from "@zilobase/runtime-ports";

export function createRuntimeEnv(
  source: RuntimeEnv,
  aliases: Readonly<Record<string, () => string | undefined>> = {},
): Env {
  return {
    get(key) {
      const aliased = aliases[key]?.();
      if (aliased !== undefined && aliased !== "") return aliased;
      const value = source[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    },
    require(key) {
      const value = this.get(key);
      if (!value) throw new Error(`${key} is required`);
      return value;
    },
  };
}
