import type { DatabaseProperty } from "@zilobase/features/databases"

import type { DatabasePropertyValue } from "../../../core/utils"
import { getFormulaExpression } from "../model/formula-config"

import type { FormulaAst, FormulaValue, FormulaValueType } from "../model/formula-types"
import { formatFormulaValue, getFormulaValueType } from "../formatting/formula-formatters"
import { FormulaParser } from "../parser/formula-parser"
import { tokenizeFormula } from "../parser/formula-tokenizer"

import {
  addFormulaValues,
  areFormulaValuesEqual,
  callEagerFormulaFunction,
  compareFormulaValues,
  compareListItems,
  flattenList,
  formulaContains,
  formatFormulaDate,
  formatFormulaNumber,
  getFormulaLength,
  isEmptyFormulaValue,
  isoWeek,
  isTruthy,
  listValue,
  normalizeDate,
  normalizePropertyName,
  numberValue,
  notionDay,
  personTextValue,
  regexMatches,
  regexTest,
  replaceWithRegex,
  requireDate,
  requireNumber,
  sliceFormulaValue,
  textValue,
  uniqueFormulaList,
  valueAtIndex,
} from "./formula-functions"

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
