export type FormulaReferenceItem = {
  category: "property" | "built-in"
  description: string
  id: string
  label: string
  propertyType?: string
  snippets: string[]
  type: string
}

export const builtInReferences: FormulaReferenceItem[] = [
  createBuiltInReference("if", "Return one value when a condition is true and another when it is false.", [
    'if(prop("Done"), "Complete", "Todo")',
  ]),
  createBuiltInReference("ifs", "Check conditions in order and return the first matching value.", [
    'ifs(prop("Priority") == "High", 1, prop("Priority") == "Low", 3, 2)',
  ]),
  createBuiltInReference("empty", "Check whether a value is empty.", [
    'empty(prop("Due Date"))',
  ]),
  createBuiltInReference("length", "Count characters in text or items in a list.", [
    'length(prop("Name"))',
    'prop("Name").length()',
  ]),
  createBuiltInReference("contains", "Check whether text or a list contains a value.", [
    'contains(prop("Name"), "Q")',
  ]),
  createBuiltInReference("format", "Convert a value to text.", [
    'format(prop("Price"))',
  ]),
  createBuiltInReference("dateAdd", "Add time to a date.", [
    'dateAdd(prop("Due Date"), 1, "days")',
  ]),
  createBuiltInReference("dateBetween", "Calculate the distance between two dates.", [
    'dateBetween(prop("Due Date"), now(), "days")',
  ]),
  createBuiltInReference("now", "Use the current date and time.", ["now()"]),
  createBuiltInReference("today", "Use today without a time value.", ["today()"]),
  createBuiltInReference("sum", "Add numbers together.", [
    'sum(prop("Price"), prop("Tax"))',
  ]),
  createBuiltInReference("mean", "Find the average of numbers.", [
    'mean(prop("Score"), prop("Bonus"))',
  ]),
  createBuiltInReference("round", "Round a number.", [
    'round(prop("Price"), 2)',
  ]),
  createBuiltInReference("formatDate", "Format a date with tokens like YYYY, MM, DD, h, and mm.", [
    'formatDate(prop("Due Date"), "YYYY-MM-DD")',
  ]),
  createBuiltInReference("formatNumber", "Format a number as text, including decimal precision or currencies.", [
    'formatNumber(prop("Revenue"), "usd", 0)',
  ]),
  createBuiltInReference("date parts", "Read individual parts of a date.", [
    'year(prop("Due Date"))',
    'month(prop("Due Date"))',
    'date(prop("Due Date"))',
  ]),
  createBuiltInReference("timestamp", "Convert dates to and from Unix timestamps in milliseconds.", [
    'timestamp(prop("Due Date"))',
    "fromTimestamp(1693443300000)",
  ]),
  createBuiltInReference("let", "Create a variable for the final expression.", [
    "let(radius, 4, round(pi() * radius ^ 2))",
  ]),
  createBuiltInReference("lets", "Create multiple variables for the final expression.", [
    'lets(a, "Hello", b, "world", a + " " + b)',
  ]),
  createBuiltInReference("map", "Transform each item in a list with current and index.", [
    "map([1, 2, 3], current + index)",
  ]),
  createBuiltInReference("filter", "Keep list items where the expression is true.", [
    "filter([1, 2, 3], current > 1)",
  ]),
  createBuiltInReference("find", "Return the first list item that matches an expression.", [
    "find([1, 2, 3], current > 2)",
    "findIndex([1, 2, 3], current > 2)",
  ]),
  createBuiltInReference("some / every", "Check whether any or all list items match an expression.", [
    "some([1, 2, 3], current == 2)",
    "every([1, 2, 3], current > 0)",
  ]),
  createBuiltInReference("list helpers", "Sort, combine, flatten, de-dupe, slice, and join lists.", [
    'unique(sort(concat([3, 1], [2, 1]))).join("-")',
    'split("apple,pear", ",")',
  ]),
  createBuiltInReference("trim", "Remove whitespace from the beginning and end of text.", [
    '" notion ".trim()',
  ]),
]

function createBuiltInReference(
  label: string,
  description: string,
  snippets: string[]
): FormulaReferenceItem {
  return {
    category: "built-in",
    description,
    id: `built-in:${label}`,
    label,
    snippets,
    type: "Built-in",
  }
}

export function getPropertyReferenceDescription(type: string) {
  if (type === "text") {
    return "Text value that can be formatted, measured, split, or combined."
  }

  if (type === "number") {
    return "Numeric value that can be used in arithmetic and comparisons."
  }

  if (type === "checkbox") {
    return "Boolean value that can drive conditions."
  }

  if (type === "date" || type === "created_time" || type === "edited_time") {
    return "Date value that works with date functions and comparisons."
  }

  if (type === "select" || type === "status" || type === "multi_select") {
    return "Option value that can be checked, counted, or matched."
  }

  return "Database property value available through prop()."
}

export function getPropertyReferenceSnippets(type: string, baseSnippet: string) {
  if (type === "text") {
    return [
      baseSnippet,
      `${baseSnippet}.style("b")`,
      `${baseSnippet}.split(" ").at(0)`,
    ]
  }

  if (type === "number") {
    return [baseSnippet, `${baseSnippet} * 2`, `round(${baseSnippet}, 2)`]
  }

  if (type === "checkbox") {
    return [baseSnippet, `not ${baseSnippet}`, `if(${baseSnippet}, "Yes", "No")`]
  }

  if (type === "date" || type === "created_time" || type === "edited_time") {
    return [baseSnippet, `dateBetween(${baseSnippet}, now(), "days")`]
  }

  return [
    baseSnippet,
    `${baseSnippet}.length()`,
    `if(empty(${baseSnippet}), "", ${baseSnippet})`,
  ]
}
