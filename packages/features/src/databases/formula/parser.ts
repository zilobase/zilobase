import type { FormulaAst, FormulaToken } from "./types"

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

export class FormulaParser {
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
