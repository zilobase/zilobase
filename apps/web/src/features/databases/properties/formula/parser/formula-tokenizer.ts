import type { FormulaToken } from "../model/formula-types"

export function tokenizeFormula(input: string): FormulaToken[] {
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
