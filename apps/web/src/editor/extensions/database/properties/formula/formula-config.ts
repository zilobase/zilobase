import {
  getMergedPropertyConfig,
  type DatabasePropertyConfig,
} from "../../views/database-view-config"

export type DatabaseFormulaConfig = DatabasePropertyConfig & {
  formula?: string
}

export function getFormulaExpression(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ""
  }

  const formula = (config as DatabaseFormulaConfig).formula

  return typeof formula === "string" ? formula : ""
}

export function getMergedFormulaConfig(config: unknown, formula: string) {
  return getMergedPropertyConfig(config, { formula })
}

export function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
