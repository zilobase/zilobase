export type FormulaValue = string | number | boolean | Date | null | FormulaValue[]

export type FormulaValueType =
  | "boolean"
  | "date"
  | "empty"
  | "list"
  | "number"
  | "text"
  | "unknown"

export type FormulaToken =
  | { raw: string; type: "number"; value: number }
  | { raw: string; type: "string"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "punctuation"; value: string }
  | { type: "eof" }

export type FormulaAst =
  | { type: "array"; elements: FormulaAst[] }
  | {
      alternate: FormulaAst
      consequent: FormulaAst
      test: FormulaAst
      type: "conditional"
    }
  | {
      arguments: FormulaAst[]
      callee: FormulaAst
      type: "call"
    }
  | { left: FormulaAst; operator: string; right: FormulaAst; type: "binary" }
  | { name: string; type: "identifier" }
  | { object: FormulaAst; property: string; type: "member" }
  | { type: "literal"; value: FormulaValue }
  | { argument: FormulaAst; operator: string; type: "unary" }
