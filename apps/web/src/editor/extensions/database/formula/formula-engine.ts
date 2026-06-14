import type { DatabaseProperty } from "@notelab/features/databases"

import type { DatabasePropertyValue } from "../utils"
import { getFormulaExpression } from "./formula-config"

type FormulaValue = string | number | boolean | Date | null | FormulaValue[]

type FormulaValueType =
  | "boolean"
  | "date"
  | "empty"
  | "list"
  | "number"
  | "text"
  | "unknown"

type FormulaToken =
  | { raw: string; type: "number"; value: number }
  | { raw: string; type: "string"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: string }
  | { type: "punctuation"; value: string }
  | { type: "eof" }

type FormulaAst =
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

export type DatabaseFormulaEvaluationContext = {
  currentPropertyId?: string
  formulaStack?: string[]
  properties: DatabaseProperty[]
  propertyValuesByKey: Record<string, DatabasePropertyValue>
  row: DatabaseFormulaRow
  titlePropertyLabel: string
  variables?: Record<string, FormulaValue>
}

export type DatabaseFormulaRow = {
  createdAt: string
  id: string
  page: {
    createdAt?: string
    name?: string
    updatedAt?: string
  }
  pageId: string
  updatedAt: string
}

export type DatabaseFormulaEvaluationResult =
  | {
      ok: true
      type: FormulaValueType
      value: FormulaValue
    }
  | {
      error: string
      ok: false
      type: "unknown"
    }

const binaryPrecedence: Record<string, number> = {
  "||": 1,
  or: 1,
  "&&": 2,
  and: 2,
  "==": 3,
  "!=": 3,
  "===": 3,
  "!==": 3,
  ">": 4,
  ">=": 4,
  "<": 4,
  "<=": 4,
  "+": 5,
  "-": 5,
  "%": 6,
  "*": 6,
  "/": 6,
  "^": 7,
}

const rightAssociativeOperators = new Set(["^"])

export function evaluateDatabaseFormula({
  expression,
  ...context
}: DatabaseFormulaEvaluationContext & {
  expression: string
}): DatabaseFormulaEvaluationResult {
  const trimmedExpression = expression.trim()

  if (!trimmedExpression) {
    return { ok: true, type: "empty", value: null }
  }

  try {
    const parser = new FormulaParser(tokenizeFormula(trimmedExpression))
    const ast = parser.parse()
    const value = evaluateFormulaAst(ast, context)

    return {
      ok: true,
      type: getFormulaValueType(value),
      value,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to evaluate this formula.",
      ok: false,
      type: "unknown",
    }
  }
}

export function formatFormulaValue(value: FormulaValue): string {
  if (value === null) {
    return ""
  }

  if (Array.isArray(value)) {
    return value.map(formatFormulaValue).filter(Boolean).join(", ")
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return ""
    }

    return value.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  return String(value)
}

export function getFormulaValueType(value: FormulaValue): FormulaValueType {
  if (value === null || value === "") {
    return "empty"
  }

  if (Array.isArray(value)) {
    return "list"
  }

  if (value instanceof Date) {
    return "date"
  }

  if (typeof value === "boolean") {
    return "boolean"
  }

  if (typeof value === "number") {
    return "number"
  }

  return "text"
}

function tokenizeFormula(input: string): FormulaToken[] {
  const tokens: FormulaToken[] = []
  let index = 0

  while (index < input.length) {
    const character = input[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    const nextTwo = input.slice(index, index + 2)
    const nextThree = input.slice(index, index + 3)

    if (["===", "!=="].includes(nextThree)) {
      tokens.push({ type: "operator", value: nextThree })
      index += 3
      continue
    }

    if (["&&", "||", "==", "!=", ">=", "<="].includes(nextTwo)) {
      tokens.push({ type: "operator", value: nextTwo })
      index += 2
      continue
    }

    if ("+-*/%^><!".includes(character)) {
      tokens.push({ type: "operator", value: character })
      index += 1
      continue
    }

    if ("(),.?:[]".includes(character)) {
      tokens.push({ type: "punctuation", value: character })
      index += 1
      continue
    }

    if (character === '"' || character === "'") {
      const quote = character
      let value = ""
      let closed = false

      index += 1

      while (index < input.length) {
        const current = input[index]

        if (current === quote) {
          closed = true
          index += 1
          break
        }

        if (current === "\\") {
          const escaped = input[index + 1]

          if (escaped === undefined) {
            throw new Error("Formula string ends with an unfinished escape.")
          }

          value += getEscapedCharacter(escaped)
          index += 2
          continue
        }

        value += current
        index += 1
      }

      if (!closed) {
        throw new Error("Formula string is missing a closing quote.")
      }

      tokens.push({ raw: value, type: "string", value })
      continue
    }

    if (/\d/.test(character)) {
      const start = index

      index += 1

      while (index < input.length && /[\d.]/.test(input[index])) {
        index += 1
      }

      const raw = input.slice(start, index)
      const value = Number(raw)

      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${raw}`)
      }

      tokens.push({ raw, type: "number", value })
      continue
    }

    if (/[A-Za-z_]/.test(character)) {
      const start = index

      index += 1

      while (index < input.length && /[A-Za-z0-9_]/.test(input[index])) {
        index += 1
      }

      const value = input.slice(start, index)
      const operator = value.toLowerCase()

      if (operator === "and" || operator === "or" || operator === "not") {
        tokens.push({ type: "operator", value: operator })
      } else {
        tokens.push({ type: "identifier", value })
      }

      continue
    }

    throw new Error(`Unexpected character: ${character}`)
  }

  tokens.push({ type: "eof" })

  return tokens
}

function getEscapedCharacter(character: string) {
  if (character === "n") {
    return "\n"
  }

  if (character === "r") {
    return "\r"
  }

  if (character === "t") {
    return "\t"
  }

  return character
}

class FormulaParser {
  private index = 0

  constructor(private readonly tokens: FormulaToken[]) {}

  parse() {
    const expression = this.parseExpression()

    this.expect("eof")

    return expression
  }

  private parseExpression(minimumPrecedence = 0): FormulaAst {
    let left = this.parseUnary()

    while (true) {
      const token = this.peek()

      if (!this.isBinaryOperator(token)) {
        break
      }

      const operator = token.value
      const precedence = binaryPrecedence[operator]

      if (precedence < minimumPrecedence) {
        break
      }

      this.advance()

      const nextMinimumPrecedence = rightAssociativeOperators.has(operator)
        ? precedence
        : precedence + 1
      const right = this.parseExpression(nextMinimumPrecedence)

      left = { left, operator, right, type: "binary" }
    }

    if (minimumPrecedence === 0 && this.matchPunctuation("?")) {
      const consequent = this.parseExpression()

      this.expectPunctuation(":")

      const alternate = this.parseExpression()

      return {
        alternate,
        consequent,
        test: left,
        type: "conditional",
      }
    }

    return left
  }

  private parseUnary(): FormulaAst {
    const token = this.peek()

    if (
      token.type === "operator" &&
      (token.value === "!" ||
        token.value === "not" ||
        token.value === "+" ||
        token.value === "-")
    ) {
      this.advance()

      return {
        argument: this.parseUnary(),
        operator: token.value,
        type: "unary",
      }
    }

    return this.parsePostfix(this.parsePrimary())
  }

  private parsePostfix(expression: FormulaAst): FormulaAst {
    let current = expression

    while (true) {
      if (this.matchPunctuation("(")) {
        current = {
          arguments: this.parseArguments(")"),
          callee: current,
          type: "call",
        }
        continue
      }

      if (this.matchPunctuation(".")) {
        const property = this.expectIdentifier()

        current = {
          object: current,
          property,
          type: "member",
        }
        continue
      }

      break
    }

    return current
  }

  private parsePrimary(): FormulaAst {
    const token = this.advance()

    if (token.type === "number" || token.type === "string") {
      return { type: "literal", value: token.value }
    }

    if (token.type === "identifier") {
      const lowerName = token.value.toLowerCase()

      if (lowerName === "true") {
        return { type: "literal", value: true }
      }

      if (lowerName === "false") {
        return { type: "literal", value: false }
      }

      if (lowerName === "null") {
        return { type: "literal", value: null }
      }

      return { name: token.value, type: "identifier" }
    }

    if (
      token.type === "operator" &&
      (token.value === "and" || token.value === "or")
    ) {
      const nextToken = this.peek()

      if (nextToken.type === "punctuation" && nextToken.value === "(") {
        return { name: token.value, type: "identifier" }
      }
    }

    if (token.type === "punctuation" && token.value === "(") {
      const expression = this.parseExpression()

      this.expectPunctuation(")")

      return expression
    }

    if (token.type === "punctuation" && token.value === "[") {
      return {
        elements: this.parseArguments("]"),
        type: "array",
      }
    }

    throw new Error("Formula contains an unexpected token.")
  }

  private parseArguments(endPunctuation: string) {
    const args: FormulaAst[] = []

    if (this.matchPunctuation(endPunctuation)) {
      return args
    }

    while (true) {
      args.push(this.parseExpression())

      if (this.matchPunctuation(endPunctuation)) {
        return args
      }

      this.expectPunctuation(",")
    }
  }

  private isBinaryOperator(token: FormulaToken): token is FormulaToken & {
    type: "operator"
  } {
    return token.type === "operator" && token.value in binaryPrecedence
  }

  private matchPunctuation(value: string) {
    const token = this.peek()

    if (token.type !== "punctuation" || token.value !== value) {
      return false
    }

    this.advance()
    return true
  }

  private expect(type: FormulaToken["type"]) {
    const token = this.advance()

    if (token.type !== type) {
      throw new Error("Formula has extra or misplaced syntax.")
    }

    return token
  }

  private expectIdentifier() {
    const token = this.advance()

    if (token.type !== "identifier") {
      throw new Error("Formula member names must be identifiers.")
    }

    return token.value
  }

  private expectPunctuation(value: string) {
    const token = this.advance()

    if (token.type !== "punctuation" || token.value !== value) {
      throw new Error(`Formula is missing "${value}".`)
    }
  }

  private advance() {
    return this.tokens[this.index++] ?? { type: "eof" as const }
  }

  private peek() {
    return this.tokens[this.index] ?? { type: "eof" as const }
  }
}

function evaluateFormulaAst(
  ast: FormulaAst,
  context: DatabaseFormulaEvaluationContext
): FormulaValue {
  switch (ast.type) {
    case "array":
      return ast.elements.map((element) => evaluateFormulaAst(element, context))
    case "binary":
      return evaluateBinaryExpression(ast, context)
    case "call":
      return evaluateCallExpression(ast, context)
    case "conditional":
      return isTruthy(evaluateFormulaAst(ast.test, context))
        ? evaluateFormulaAst(ast.consequent, context)
        : evaluateFormulaAst(ast.alternate, context)
    case "identifier":
      return evaluateIdentifier(ast.name, context)
    case "literal":
      return ast.value
    case "member":
      return evaluateMemberExpression(ast, context)
    case "unary":
      return evaluateUnaryExpression(ast, context)
  }
}

function evaluateIdentifier(
  name: string,
  context: DatabaseFormulaEvaluationContext
) {
  if (
    context.variables &&
    Object.prototype.hasOwnProperty.call(context.variables, name)
  ) {
    return context.variables[name] ?? null
  }

  const propertyValue = resolveDatabasePropertyValue(name, context)

  if (propertyValue.found) {
    return propertyValue.value
  }

  throw new Error(`Unknown identifier: ${name}`)
}

function evaluateUnaryExpression(
  ast: Extract<FormulaAst, { type: "unary" }>,
  context: DatabaseFormulaEvaluationContext
) {
  const value = evaluateFormulaAst(ast.argument, context)

  if (ast.operator === "!" || ast.operator === "not") {
    return !isTruthy(value)
  }

  const numberValue = requireNumber(value)

  return ast.operator === "-" ? numberValue * -1 : numberValue
}

function evaluateBinaryExpression(
  ast: Extract<FormulaAst, { type: "binary" }>,
  context: DatabaseFormulaEvaluationContext
) {
  if (ast.operator === "and" || ast.operator === "&&") {
    return (
      isTruthy(evaluateFormulaAst(ast.left, context)) &&
      isTruthy(evaluateFormulaAst(ast.right, context))
    )
  }

  if (ast.operator === "or" || ast.operator === "||") {
    return (
      isTruthy(evaluateFormulaAst(ast.left, context)) ||
      isTruthy(evaluateFormulaAst(ast.right, context))
    )
  }

  const left = evaluateFormulaAst(ast.left, context)
  const right = evaluateFormulaAst(ast.right, context)

  switch (ast.operator) {
    case "+":
      return addFormulaValues(left, right)
    case "-":
      return requireNumber(left) - requireNumber(right)
    case "*":
      return requireNumber(left) * requireNumber(right)
    case "/":
      return requireNumber(left) / requireNumber(right)
    case "%":
      return requireNumber(left) % requireNumber(right)
    case "^":
      return requireNumber(left) ** requireNumber(right)
    case "==":
    case "===":
      return areFormulaValuesEqual(left, right)
    case "!=":
    case "!==":
      return !areFormulaValuesEqual(left, right)
    case ">":
    case ">=":
    case "<":
    case "<=":
      return compareFormulaValues(left, right, ast.operator)
    default:
      throw new Error(`Unsupported operator: ${ast.operator}`)
  }
}

function evaluateCallExpression(
  ast: Extract<FormulaAst, { type: "call" }>,
  context: DatabaseFormulaEvaluationContext
) {
  if (ast.callee.type === "identifier") {
    return callFormulaFunction(ast.callee.name, ast.arguments, context)
  }

  if (ast.callee.type === "member") {
    const objectValue = evaluateFormulaAst(ast.callee.object, context)

    return callFormulaMethod(
      objectValue,
      ast.callee.property,
      ast.arguments,
      context
    )
  }

  throw new Error("Formula can only call functions or methods.")
}

function evaluateMemberExpression(
  ast: Extract<FormulaAst, { type: "member" }>,
  context: DatabaseFormulaEvaluationContext
) {
  const objectValue = evaluateFormulaAst(ast.object, context)

  if (ast.property === "length") {
    return getFormulaLength(objectValue)
  }

  throw new Error(`Unknown formula member: ${ast.property}`)
}

function callFormulaFunction(
  name: string,
  argumentAsts: FormulaAst[],
  context: DatabaseFormulaEvaluationContext
): FormulaValue {
  const lowerName = name.toLowerCase()

  if (lowerName === "prop") {
    const propertyName = evaluateFormulaAst(argumentAsts[0], context)

    if (typeof propertyName !== "string") {
      throw new Error('prop() expects a property name like prop("Name").')
    }

    return resolveDatabasePropertyValue(propertyName, context).value
  }

  if (lowerName === "if") {
    if (argumentAsts.length < 3) {
      throw new Error("if() expects a condition, true value, and false value.")
    }

    return isTruthy(evaluateFormulaAst(argumentAsts[0], context))
      ? evaluateFormulaAst(argumentAsts[1], context)
      : evaluateFormulaAst(argumentAsts[2], context)
  }

  if (lowerName === "ifs") {
    for (let index = 0; index + 1 < argumentAsts.length; index += 2) {
      if (isTruthy(evaluateFormulaAst(argumentAsts[index], context))) {
        return evaluateFormulaAst(argumentAsts[index + 1], context)
      }
    }

    return argumentAsts.length % 2 === 1
      ? evaluateFormulaAst(argumentAsts[argumentAsts.length - 1], context)
      : null
  }

  if (lowerName === "let") {
    if (argumentAsts.length !== 3) {
      throw new Error("let() expects a variable, value, and expression.")
    }

    const variableName = getVariableName(argumentAsts[0], "let")
    const variableValue = evaluateFormulaAst(argumentAsts[1], context)

    return evaluateFormulaAst(
      argumentAsts[2],
      withFormulaVariables(context, { [variableName]: variableValue })
    )
  }

  if (lowerName === "lets") {
    if (argumentAsts.length < 3 || argumentAsts.length % 2 === 0) {
      throw new Error("lets() expects variable/value pairs and an expression.")
    }

    let scopedContext = context

    for (let index = 0; index < argumentAsts.length - 1; index += 2) {
      const variableName = getVariableName(argumentAsts[index], "lets")
      const variableValue = evaluateFormulaAst(argumentAsts[index + 1], scopedContext)

      scopedContext = withFormulaVariables(scopedContext, {
        [variableName]: variableValue,
      })
    }

    return evaluateFormulaAst(argumentAsts[argumentAsts.length - 1], scopedContext)
  }

  if (isLazyListFunction(lowerName)) {
    return evaluateScopedListFunction(lowerName, argumentAsts, context)
  }

  if (lowerName === "id") {
    if (argumentAsts.length === 0) {
      return context.row.pageId || context.row.id
    }

    return formatFormulaValue(evaluateFormulaAst(argumentAsts[0], context))
  }

  const args = argumentAsts.map((argument) => evaluateFormulaAst(argument, context))

  return callEagerFormulaFunction(lowerName, args)
}

function getVariableName(ast: FormulaAst, functionName: string) {
  if (ast.type === "identifier") {
    return ast.name
  }

  if (
    ast.type === "literal" &&
    typeof ast.value === "string" &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(ast.value)
  ) {
    return ast.value
  }

  throw new Error(`${functionName}() variable names must be identifiers.`)
}

function withFormulaVariables(
  context: DatabaseFormulaEvaluationContext,
  variables: Record<string, FormulaValue>
): DatabaseFormulaEvaluationContext {
  return {
    ...context,
    variables: {
      ...context.variables,
      ...variables,
    },
  }
}

function isLazyListFunction(name: string) {
  return (
    name === "every" ||
    name === "filter" ||
    name === "find" ||
    name === "findindex" ||
    name === "map" ||
    name === "some"
  )
}

function evaluateScopedListFunction(
  name: string,
  argumentAsts: FormulaAst[],
  context: DatabaseFormulaEvaluationContext
) {
  if (argumentAsts.length < 2) {
    throw new Error(`${name}() expects a list and an expression.`)
  }

  const values = listValue(evaluateFormulaAst(argumentAsts[0], context))
  const expression = argumentAsts[1]

  return evaluateScopedListValues(name, values, expression, context)
}

function evaluateScopedListMethod(
  name: string,
  objectValue: FormulaValue,
  argumentAsts: FormulaAst[],
  context: DatabaseFormulaEvaluationContext
) {
  if (argumentAsts.length < 1) {
    throw new Error(`.${name}() expects an expression.`)
  }

  return evaluateScopedListValues(
    name,
    listValue(objectValue),
    argumentAsts[0],
    context
  )
}

function evaluateScopedListValues(
  name: string,
  values: FormulaValue[],
  expression: FormulaAst,
  context: DatabaseFormulaEvaluationContext
) {
  if (name === "map") {
    return values.map((value, index) =>
      evaluateFormulaAst(expression, withListScope(context, value, index))
    )
  }

  if (name === "filter") {
    return values.filter((value, index) =>
      isTruthy(evaluateFormulaAst(expression, withListScope(context, value, index)))
    )
  }

  if (name === "find") {
    return (
      values.find((value, index) =>
        isTruthy(evaluateFormulaAst(expression, withListScope(context, value, index)))
      ) ?? null
    )
  }

  if (name === "findindex") {
    return values.findIndex((value, index) =>
      isTruthy(evaluateFormulaAst(expression, withListScope(context, value, index)))
    )
  }

  if (name === "some") {
    return values.some((value, index) =>
      isTruthy(evaluateFormulaAst(expression, withListScope(context, value, index)))
    )
  }

  if (name === "every") {
    return values.every((value, index) =>
      isTruthy(evaluateFormulaAst(expression, withListScope(context, value, index)))
    )
  }

  throw new Error(`Unknown list function: ${name}()`)
}

function withListScope(
  context: DatabaseFormulaEvaluationContext,
  current: FormulaValue,
  index: number
) {
  return withFormulaVariables(context, { current, index })
}

function callEagerFormulaFunction(name: string, args: FormulaValue[]) {
  switch (name) {
    case "abs":
      return Math.abs(requireNumber(args[0]))
    case "add":
      return requireNumber(args[0]) + requireNumber(args[1])
    case "and":
      return args.every(isTruthy)
    case "at":
      return valueAtIndex(args[0], requireNumber(args[1]))
    case "cbrt":
      return Math.cbrt(requireNumber(args[0]))
    case "ceil":
      return Math.ceil(requireNumber(args[0]))
    case "concat":
      return args.flatMap(listValue)
    case "contains":
      return formulaContains(args[0], args[1])
    case "date":
      return requireDate(args[0]).getDate()
    case "dateadd":
      return addDate(args[0], requireNumber(args[1]), textValue(args[2]))
    case "datebetween":
      return dateBetween(args[0], args[1], textValue(args[2]))
    case "dateend":
      return Array.isArray(args[0]) ? args[0][1] ?? args[0][0] ?? null : args[0]
    case "daterange":
      return [normalizeDate(args[0]), normalizeDate(args[1])].filter(
        (date): date is Date => date instanceof Date
      )
    case "datestart":
      return Array.isArray(args[0]) ? args[0][0] ?? null : args[0]
    case "datesubtract":
      return addDate(args[0], requireNumber(args[1]) * -1, textValue(args[2]))
    case "day":
      return notionDay(requireDate(args[0]))
    case "divide":
      return requireNumber(args[0]) / requireNumber(args[1])
    case "e":
      return Math.E
    case "email":
      return personTextValue(args[0])
    case "empty":
      return isEmptyFormulaValue(args[0])
    case "equal":
      return areFormulaValuesEqual(args[0], args[1])
    case "exp":
      return Math.exp(requireNumber(args[0]))
    case "first":
      return valueAtIndex(args[0], 0)
    case "flat":
      return flattenList(listValue(args[0]))
    case "floor":
      return Math.floor(requireNumber(args[0]))
    case "format":
      return formatFormulaValue(args[0])
    case "formatdate":
      return formatFormulaDate(args[0], textValue(args[1]))
    case "formatnumber":
      return formatFormulaNumber(args[0], args[1], args[2])
    case "fromtimestamp": {
      const date = new Date(requireNumber(args[0]))

      date.setSeconds(0, 0)

      return Number.isFinite(date.getTime()) ? date : null
    }
    case "hour":
      return requireDate(args[0]).getHours()
    case "includes":
      return formulaContains(args[0], args[1])
    case "join":
      return listValue(args[0]).map(formatFormulaValue).join(textValue(args[1]))
    case "last":
      return valueAtIndex(args[0], -1)
    case "length":
      return getFormulaLength(args[0])
    case "link":
      return textValue(args[0])
    case "ln":
      return Math.log(requireNumber(args[0]))
    case "log10":
      return Math.log10(requireNumber(args[0]))
    case "log2":
      return Math.log2(requireNumber(args[0]))
    case "lower":
      return textValue(args[0]).toLowerCase()
    case "match":
      return regexMatches(args[0], args[1])
    case "max":
      return Math.max(...flattenNumbers(args))
    case "mean": {
      const numbers = flattenNumbers(args)

      return numbers.length
        ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
        : null
    }
    case "median":
      return median(args)
    case "min":
      return Math.min(...flattenNumbers(args))
    case "minute":
      return requireDate(args[0]).getMinutes()
    case "mod":
      return requireNumber(args[0]) % requireNumber(args[1])
    case "month":
      return requireDate(args[0]).getMonth() + 1
    case "multiply":
      return requireNumber(args[0]) * requireNumber(args[1])
    case "name":
      return personTextValue(args[0])
    case "not":
      return !isTruthy(args[0])
    case "now":
      return new Date()
    case "or":
      return args.some(isTruthy)
    case "parsedate":
      return normalizeDate(args[0])
    case "pi":
      return Math.PI
    case "pow":
      return requireNumber(args[0]) ** requireNumber(args[1])
    case "replace":
      return replaceWithRegex(args[0], args[1], args[2], false)
    case "replaceall":
      return replaceWithRegex(args[0], args[1], args[2], true)
    case "repeat":
      return textValue(args[0]).repeat(Math.max(0, Math.trunc(requireNumber(args[1]))))
    case "reverse":
      return [...listValue(args[0])].reverse()
    case "round":
      return roundNumber(args[0], args[1])
    case "sign":
      return Math.sign(requireNumber(args[0]))
    case "slice":
      return sliceFormulaValue(args[0], args[1], args[2])
    case "sort":
      return [...listValue(args[0])].sort(compareListItems)
    case "split":
      return textValue(args[0]).split(textValue(args[1]))
    case "sqrt":
      return Math.sqrt(requireNumber(args[0]))
    case "style":
      return textValue(args[0])
    case "substring":
      return textValue(args[0]).slice(
        requireNumber(args[1]),
        args[2] === undefined ? undefined : requireNumber(args[2])
      )
    case "subtract":
      return requireNumber(args[0]) - requireNumber(args[1])
    case "sum":
      return flattenNumbers(args).reduce((sum, value) => sum + value, 0)
    case "test":
      return regexTest(args[0], args[1])
    case "timestamp":
      return requireDate(args[0]).getTime()
    case "today": {
      const date = new Date()

      date.setHours(0, 0, 0, 0)

      return date
    }
    case "tonumber":
      return numberValue(args[0])
    case "trim":
      return textValue(args[0]).trim()
    case "unequal":
      return !areFormulaValuesEqual(args[0], args[1])
    case "unique":
      return uniqueFormulaList(listValue(args[0]))
    case "unstyle":
      return textValue(args[0])
    case "upper":
      return textValue(args[0]).toUpperCase()
    case "week":
      return isoWeek(requireDate(args[0]))
    case "year":
      return requireDate(args[0]).getFullYear()
    default:
      throw new Error(`Unknown function: ${name}()`)
  }
}

function callFormulaMethod(
  objectValue: FormulaValue,
  method: string,
  argumentAsts: FormulaAst[],
  context: DatabaseFormulaEvaluationContext
) {
  const lowerMethod = method.toLowerCase()

  if (isLazyListFunction(lowerMethod)) {
    return evaluateScopedListMethod(
      lowerMethod,
      objectValue,
      argumentAsts,
      context
    )
  }

  const args = argumentAsts.map((argument) => evaluateFormulaAst(argument, context))

  switch (lowerMethod) {
    case "at":
      return valueAtIndex(objectValue, requireNumber(args[0]))
    case "concat":
      return listValue(objectValue).concat(args.flatMap(listValue))
    case "contains":
    case "includes":
      return formulaContains(objectValue, args[0])
    case "date":
      return requireDate(objectValue).getDate()
    case "day":
      return notionDay(requireDate(objectValue))
    case "email":
    case "name":
      return personTextValue(objectValue)
    case "empty":
      return isEmptyFormulaValue(objectValue)
    case "first":
      return valueAtIndex(objectValue, 0)
    case "flat":
      return flattenList(listValue(objectValue))
    case "format":
      return formatFormulaValue(objectValue)
    case "formatdate":
      return formatFormulaDate(objectValue, textValue(args[0]))
    case "formatnumber":
      return formatFormulaNumber(objectValue, args[0], args[1])
    case "hour":
      return requireDate(objectValue).getHours()
    case "join":
      return listValue(objectValue).map(formatFormulaValue).join(textValue(args[0]))
    case "last":
      return valueAtIndex(objectValue, -1)
    case "length":
      return getFormulaLength(objectValue)
    case "lower":
      return textValue(objectValue).toLowerCase()
    case "match":
      return regexMatches(objectValue, args[0])
    case "minute":
      return requireDate(objectValue).getMinutes()
    case "month":
      return requireDate(objectValue).getMonth() + 1
    case "replace":
      return replaceWithRegex(objectValue, args[0], args[1], false)
    case "replaceall":
      return replaceWithRegex(objectValue, args[0], args[1], true)
    case "repeat":
      return textValue(objectValue).repeat(
        Math.max(0, Math.trunc(requireNumber(args[0])))
      )
    case "reverse":
      return [...listValue(objectValue)].reverse()
    case "slice":
      return sliceFormulaValue(objectValue, args[0], args[1])
    case "sort":
      return [...listValue(objectValue)].sort(compareListItems)
    case "split":
      return textValue(objectValue).split(textValue(args[0]))
    case "style":
      return textValue(objectValue)
    case "substring":
      return textValue(objectValue).slice(
        requireNumber(args[0]),
        args[1] === undefined ? undefined : requireNumber(args[1])
      )
    case "test":
      return regexTest(objectValue, args[0])
    case "timestamp":
      return requireDate(objectValue).getTime()
    case "trim":
      return textValue(objectValue).trim()
    case "unique":
      return uniqueFormulaList(listValue(objectValue))
    case "unstyle":
      return textValue(objectValue)
    case "tonumber":
      return numberValue(objectValue)
    case "upper":
      return textValue(objectValue).toUpperCase()
    case "week":
      return isoWeek(requireDate(objectValue))
    case "year":
      return requireDate(objectValue).getFullYear()
    default:
      throw new Error(`Unknown formula method: .${method}()`)
  }
}

function resolveDatabasePropertyValue(
  propertyName: string,
  context: DatabaseFormulaEvaluationContext
): { found: boolean; value: FormulaValue } {
  const normalizedPropertyName = normalizePropertyName(propertyName)
  const titleNames = new Set(
    [context.titlePropertyLabel, "Name", "Title"].map(normalizePropertyName)
  )

  if (titleNames.has(normalizedPropertyName)) {
    return { found: true, value: context.row.page.name ?? "" }
  }

  const property = context.properties.find(
    (candidate) =>
      normalizePropertyName(candidate.property.name) === normalizedPropertyName
  )

  if (!property) {
    return { found: false, value: null }
  }

  if (property.property.type === "formula") {
    return {
      found: true,
      value: evaluateReferencedFormula(property, context),
    }
  }

  return {
    found: true,
    value: normalizePropertyValue(
      context.propertyValuesByKey[`${context.row.pageId}:${property.property.id}`],
      property.property.type,
      context.row
    ),
  }
}

function evaluateReferencedFormula(
  property: DatabaseProperty,
  context: DatabaseFormulaEvaluationContext
) {
  const stack = context.formulaStack ?? []

  if (
    property.property.id === context.currentPropertyId ||
    stack.includes(property.property.id)
  ) {
    throw new Error("Formula contains a circular property reference.")
  }

  const expression = getFormulaExpression(property.property.config)

  if (!expression.trim()) {
    return null
  }

  const result = evaluateDatabaseFormula({
    ...context,
    currentPropertyId: property.property.id,
    expression,
    formulaStack: [...stack, property.property.id],
  })

  if (!result.ok) {
    throw new Error(result.error)
  }

  return result.value
}

function normalizePropertyValue(
  value: DatabasePropertyValue | undefined,
  type: string,
  row: DatabaseFormulaRow
): FormulaValue {
  if (type === "created_time") {
    return normalizeDate(row.page.createdAt ?? row.createdAt)
  }

  if (type === "edited_time") {
    return normalizeDate(row.page.updatedAt ?? row.updatedAt)
  }

  if (type === "checkbox") {
    return value === "true"
  }

  if (type === "number") {
    return numberValue(value ?? null)
  }

  if (type === "date") {
    if (Array.isArray(value)) {
      return value.flatMap((item) => {
        const date = normalizeDate(item)

        return date ? [date] : []
      })
    }

    return normalizeDate(value ?? null)
  }

  if (Array.isArray(value)) {
    return value
  }

  return value ?? ""
}

function normalizePropertyName(name: string) {
  return name.trim().toLowerCase()
}

function addFormulaValues(left: FormulaValue, right: FormulaValue) {
  const leftNumber = numberValue(left)
  const rightNumber = numberValue(right)

  if (
    leftNumber !== null &&
    rightNumber !== null &&
    typeof left !== "string" &&
    typeof right !== "string"
  ) {
    return leftNumber + rightNumber
  }

  return textValue(left) + textValue(right)
}

function compareFormulaValues(
  left: FormulaValue,
  right: FormulaValue,
  operator: string
) {
  const leftComparable = comparableValue(left)
  const rightComparable = comparableValue(right)
  const comparison =
    typeof leftComparable === "number" && typeof rightComparable === "number"
      ? leftComparable - rightComparable
      : String(leftComparable).localeCompare(String(rightComparable), undefined, {
          numeric: true,
          sensitivity: "base",
        })

  if (operator === ">") {
    return comparison > 0
  }

  if (operator === ">=") {
    return comparison >= 0
  }

  if (operator === "<") {
    return comparison < 0
  }

  return comparison <= 0
}

function areFormulaValuesEqual(left: FormulaValue, right: FormulaValue) {
  const leftComparable = comparableValue(left)
  const rightComparable = comparableValue(right)

  return leftComparable === rightComparable
}

function comparableValue(value: FormulaValue): number | string {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number") {
    return value
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0
  }

  if (Array.isArray(value)) {
    return value.map(formatFormulaValue).join(", ")
  }

  return formatFormulaValue(value)
}

function isTruthy(value: FormulaValue) {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
  }

  if (typeof value === "number") {
    return value !== 0 && Number.isFinite(value)
  }

  if (typeof value === "boolean") {
    return value
  }

  return Boolean(value)
}

function isEmptyFormulaValue(value: FormulaValue | undefined) {
  if (value === undefined || value === null || value === "") {
    return true
  }

  if (typeof value === "number") {
    return value === 0
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return false
}

function getFormulaLength(value: FormulaValue | undefined) {
  if (Array.isArray(value) || typeof value === "string") {
    return value.length
  }

  return formatFormulaValue(value ?? null).length
}

function formulaContains(value: FormulaValue, search: FormulaValue) {
  if (Array.isArray(value)) {
    return value.some((item) => areFormulaValuesEqual(item, search))
  }

  return textValue(value).includes(textValue(search))
}

function listValue(value: FormulaValue | undefined): FormulaValue[] {
  if (Array.isArray(value)) {
    return value
  }

  if (value === undefined || value === null || value === "") {
    return []
  }

  return [value]
}

function flattenList(values: FormulaValue[]): FormulaValue[] {
  return values.flatMap((value) =>
    Array.isArray(value) ? flattenList(value) : [value]
  )
}

function uniqueFormulaList(values: FormulaValue[]) {
  return values.filter(
    (value, index) =>
      values.findIndex((candidate) => areFormulaValuesEqual(candidate, value)) ===
      index
  )
}

function compareListItems(left: FormulaValue, right: FormulaValue) {
  const leftComparable = comparableValue(left)
  const rightComparable = comparableValue(right)

  if (typeof leftComparable === "number" && typeof rightComparable === "number") {
    return leftComparable - rightComparable
  }

  return String(leftComparable).localeCompare(String(rightComparable), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

function sliceFormulaValue(
  value: FormulaValue,
  start: FormulaValue | undefined,
  end: FormulaValue | undefined
) {
  const startIndex = Math.trunc(requireNumber(start))
  const endIndex = end === undefined ? undefined : Math.trunc(requireNumber(end))

  if (typeof value === "string") {
    return value.slice(startIndex, endIndex)
  }

  return listValue(value).slice(startIndex, endIndex)
}

function personTextValue(value: FormulaValue | undefined) {
  return Array.isArray(value)
    ? formatFormulaValue(value[0] ?? null)
    : formatFormulaValue(value ?? null)
}

function textValue(value: FormulaValue | undefined) {
  return formatFormulaValue(value ?? null)
}

function numberValue(value: FormulaValue | DatabasePropertyValue): number | null {
  if (Array.isArray(value)) {
    return numberValue(value[0] ?? null)
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return null
    }

    const nextValue = Number(trimmedValue)

    return Number.isFinite(nextValue) ? nextValue : null
  }

  return null
}

function requireNumber(value: FormulaValue | undefined): number {
  const nextValue = numberValue(value ?? null)

  if (nextValue === null) {
    throw new Error(`Expected a number, received ${formatFormulaValue(value ?? null) || "empty"}.`)
  }

  return nextValue
}

function flattenNumbers(values: FormulaValue[]): number[] {
  const numbers: number[] = values.flatMap((value) =>
    Array.isArray(value) ? flattenNumbers(value) : [requireNumber(value)]
  )

  if (numbers.length === 0) {
    throw new Error("Expected at least one number.")
  }

  return numbers
}

function median(values: FormulaValue[]): number | null {
  const numbers = flattenNumbers(values).sort((left, right) => left - right)
  const midpoint = Math.floor(numbers.length / 2)

  return numbers.length % 2 === 0
    ? ((numbers[midpoint - 1] ?? 0) + (numbers[midpoint] ?? 0)) / 2
    : numbers[midpoint] ?? null
}

function roundNumber(value: FormulaValue | undefined, places: FormulaValue | undefined) {
  const number = requireNumber(value)
  const decimalPlaces = places === undefined ? 0 : requireNumber(places)
  const multiplier = 10 ** decimalPlaces

  return Math.round(number * multiplier) / multiplier
}

function formatFormulaNumber(
  value: FormulaValue | undefined,
  format: FormulaValue | undefined,
  decimalPlaces: FormulaValue | undefined
) {
  const number = requireNumber(value)
  const normalizedFormat = textValue(format).trim().toLowerCase()
  const digits =
    decimalPlaces === undefined
      ? undefined
      : Math.max(0, Math.trunc(requireNumber(decimalPlaces)))
  const options: Intl.NumberFormatOptions = {}
  const currency = getCurrencyCode(normalizedFormat)

  if (digits !== undefined) {
    options.minimumFractionDigits = digits
    options.maximumFractionDigits = digits
  }

  if (normalizedFormat === "percent" || normalizedFormat === "%") {
    options.style = "percent"
  } else if (currency) {
    options.currency = currency
    options.style = "currency"
  }

  return new Intl.NumberFormat(undefined, options).format(number)
}

function getCurrencyCode(format: string) {
  const normalizedFormat = format.toUpperCase()
  const currencyAliases: Record<string, string> = {
    DOLLAR: "USD",
    DOLLARS: "USD",
    EURO: "EUR",
    EUROS: "EUR",
    POUND: "GBP",
    POUNDS: "GBP",
    RUPEE: "INR",
    RUPEES: "INR",
    YEN: "JPY",
  }

  if (/^[A-Z]{3}$/.test(normalizedFormat)) {
    return normalizedFormat
  }

  return currencyAliases[normalizedFormat] ?? null
}

function formatFormulaDate(
  value: FormulaValue | undefined,
  format: string
) {
  const date = requireDate(value)
  const trimmedFormat = format.trim()

  if (!trimmedFormat) {
    return formatFormulaValue(date)
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const shortMonthNames = monthNames.map((month) => month.slice(0, 3))
  const hours = date.getHours()
  const twelveHour = hours % 12 || 12
  const replacements: Record<string, string> = {
    A: hours >= 12 ? "PM" : "AM",
    a: hours >= 12 ? "pm" : "am",
    D: String(date.getDate()),
    DD: padDatePart(date.getDate()),
    H: String(hours),
    HH: padDatePart(hours),
    h: String(twelveHour),
    hh: padDatePart(twelveHour),
    M: String(date.getMonth() + 1),
    MM: padDatePart(date.getMonth() + 1),
    MMM: shortMonthNames[date.getMonth()] ?? "",
    MMMM: monthNames[date.getMonth()] ?? "",
    mm: padDatePart(date.getMinutes()),
    ss: padDatePart(date.getSeconds()),
    Y: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    YYYY: String(date.getFullYear()),
  }

  return trimmedFormat.replace(
    /YYYY|MMMM|MMM|YY|MM|DD|HH|hh|mm|ss|Y|M|D|H|h|A|a/g,
    (token) => replacements[token] ?? token
  )
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0")
}

function normalizeDate(value: FormulaValue | DatabasePropertyValue): Date | null {
  if (Array.isArray(value)) {
    return normalizeDate(value[0] ?? null)
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }

  if (typeof value === "number") {
    const date = new Date(value)

    return Number.isFinite(date.getTime()) ? date : null
  }

  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)

    return Number.isFinite(date.getTime()) ? date : null
  }

  return null
}

function requireDate(value: FormulaValue | undefined) {
  const date = normalizeDate(value ?? null)

  if (!date) {
    throw new Error("Expected a date value.")
  }

  return date
}

function addDate(value: FormulaValue, amount: number, unit: string) {
  const date = new Date(requireDate(value))
  const normalizedUnit = unit.toLowerCase()

  if (normalizedUnit.startsWith("year")) {
    date.setFullYear(date.getFullYear() + amount)
  } else if (normalizedUnit.startsWith("quarter")) {
    date.setMonth(date.getMonth() + amount * 3)
  } else if (normalizedUnit.startsWith("month")) {
    date.setMonth(date.getMonth() + amount)
  } else if (normalizedUnit.startsWith("week")) {
    date.setDate(date.getDate() + amount * 7)
  } else if (normalizedUnit.startsWith("day")) {
    date.setDate(date.getDate() + amount)
  } else if (normalizedUnit.startsWith("hour")) {
    date.setHours(date.getHours() + amount)
  } else if (normalizedUnit.startsWith("minute")) {
    date.setMinutes(date.getMinutes() + amount)
  } else {
    throw new Error(`Unknown date unit: ${unit}`)
  }

  return date
}

function dateBetween(left: FormulaValue, right: FormulaValue, unit: string) {
  const diff = requireDate(left).getTime() - requireDate(right).getTime()
  const normalizedUnit = unit.toLowerCase()
  const day = 24 * 60 * 60 * 1000

  if (normalizedUnit.startsWith("year")) {
    return Math.trunc(diff / (365 * day))
  }

  if (normalizedUnit.startsWith("quarter")) {
    return Math.trunc(diff / (91.25 * day))
  }

  if (normalizedUnit.startsWith("month")) {
    return Math.trunc(diff / (30.4375 * day))
  }

  if (normalizedUnit.startsWith("week")) {
    return Math.trunc(diff / (7 * day))
  }

  if (normalizedUnit.startsWith("day")) {
    return Math.trunc(diff / day)
  }

  if (normalizedUnit.startsWith("hour")) {
    return Math.trunc(diff / (60 * 60 * 1000))
  }

  if (normalizedUnit.startsWith("minute")) {
    return Math.trunc(diff / (60 * 1000))
  }

  throw new Error(`Unknown date unit: ${unit}`)
}

function notionDay(date: Date) {
  const day = date.getDay()

  return day === 0 ? 7 : day
}

function isoWeek(date: Date) {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  )
  const day = utcDate.getUTCDay() || 7

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))

  return Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  )
}

function valueAtIndex(value: FormulaValue, rawIndex: number) {
  const index = Math.trunc(rawIndex)
  const values =
    typeof value === "string"
      ? [...value]
      : Array.isArray(value)
        ? value
        : [value]
  const normalizedIndex = index < 0 ? values.length + index : index

  return values[normalizedIndex] ?? null
}

function regexTest(value: FormulaValue, pattern: FormulaValue) {
  try {
    return new RegExp(textValue(pattern)).test(textValue(value))
  } catch {
    return false
  }
}

function regexMatches(value: FormulaValue, pattern: FormulaValue) {
  try {
    return Array.from(textValue(value).matchAll(new RegExp(textValue(pattern), "g")))
      .map((match) => match[0])
  } catch {
    return []
  }
}

function replaceWithRegex(
  value: FormulaValue,
  pattern: FormulaValue,
  replacement: FormulaValue,
  all: boolean
) {
  try {
    return textValue(value).replace(
      new RegExp(textValue(pattern), all ? "g" : undefined),
      textValue(replacement)
    )
  } catch {
    return textValue(value)
  }
}
