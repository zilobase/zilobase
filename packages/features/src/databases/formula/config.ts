type DatabaseFormulaConfig = {
  formula?: string
  [key: string]: unknown
}

export function getFormulaExpression(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ""
  }

  const formula = (config as DatabaseFormulaConfig).formula

  return typeof formula === "string" ? formula : ""
}

export function getMergedFormulaConfig(config: unknown, formula: string) {
  return {
    ...(config && typeof config === "object" && !Array.isArray(config)
      ? config
      : {}),
    formula,
  }
}

export function escapeFormulaString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
