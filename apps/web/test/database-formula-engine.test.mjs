export function register({ assert, loadModule, test }) {
  test("database formulas evaluate Notion-style property expressions", async () => {
    const { evaluateDatabaseFormula, formatFormulaValue } = await loadModule(
      "/src/editor/extensions/database/properties/formula/formula-engine.ts"
    )
    const context = createFormulaContext()

    const totalResult = evaluateDatabaseFormula({
      ...context,
      expression: 'prop("Price") * prop("Quantity")',
    })
    const firstNameResult = evaluateDatabaseFormula({
      ...context,
      expression: 'prop("Full Name").split(" ").at(0)',
    })
    const statusResult = evaluateDatabaseFormula({
      ...context,
      expression: 'if(prop("Done"), "Complete", "Todo")',
    })
    const titleResult = evaluateDatabaseFormula({
      ...context,
      expression: 'prop("Name").length()',
    })

    assert.deepEqual(totalResult, { ok: true, type: "number", value: 36 })
    assert.deepEqual(firstNameResult, { ok: true, type: "text", value: "Ada" })
    assert.deepEqual(statusResult, {
      ok: true,
      type: "text",
      value: "Complete",
    })
    assert.deepEqual(titleResult, { ok: true, type: "number", value: 13 })
    assert.equal(formatFormulaValue(totalResult.value), "36")
  })

  test("database formulas can reference other formula properties", async () => {
    const { evaluateDatabaseFormula } = await loadModule(
      "/src/editor/extensions/database/properties/formula/formula-engine.ts"
    )
    const context = createFormulaContext({
      extraProperties: [
        createProperty(
          "database-property-total",
          "property-total",
          "Total",
          "formula",
          { formula: 'prop("Price") * prop("Quantity")' }
        ),
      ],
    })

    const result = evaluateDatabaseFormula({
      ...context,
      expression: 'prop("Total") + 4',
    })

    assert.deepEqual(result, { ok: true, type: "number", value: 40 })
  })

  test("database formulas support variables and scoped list expressions", async () => {
    const { evaluateDatabaseFormula, formatFormulaValue } = await loadModule(
      "/src/editor/extensions/database/properties/formula/formula-engine.ts"
    )
    const context = createFormulaContext()

    const letResult = evaluateDatabaseFormula({
      ...context,
      expression: "let(radius, 4, round(pi() * radius ^ 2))",
    })
    const letsResult = evaluateDatabaseFormula({
      ...context,
      expression: 'lets(a, "Hello", b, "world", a + " " + b)',
    })
    const mapResult = evaluateDatabaseFormula({
      ...context,
      expression: "map([1, 2, 3], current + index)",
    })
    const filterResult = evaluateDatabaseFormula({
      ...context,
      expression: 'filter([1, 2, 3], current > 1).join(",")',
    })
    const findResult = evaluateDatabaseFormula({
      ...context,
      expression: "find([1, 2, 3], current > 2)",
    })
    const everyResult = evaluateDatabaseFormula({
      ...context,
      expression: "every([1, 2, 3], current > 0)",
    })

    assert.deepEqual(letResult, { ok: true, type: "number", value: 50 })
    assert.deepEqual(letsResult, { ok: true, type: "text", value: "Hello world" })
    assert.deepEqual(mapResult, { ok: true, type: "list", value: [1, 3, 5] })
    assert.deepEqual(filterResult, { ok: true, type: "text", value: "2,3" })
    assert.deepEqual(findResult, { ok: true, type: "number", value: 3 })
    assert.deepEqual(everyResult, { ok: true, type: "boolean", value: true })
    assert.equal(formatFormulaValue(mapResult.value), "1, 3, 5")
  })

  test("database formulas support date, number, and list utility functions", async () => {
    const { evaluateDatabaseFormula, formatFormulaValue } = await loadModule(
      "/src/editor/extensions/database/properties/formula/formula-engine.ts"
    )
    const context = createFormulaContext()

    const dateResult = evaluateDatabaseFormula({
      ...context,
      expression: 'formatDate(parseDate("2026-06-14T09:30:15.000Z"), "YYYY-MM-DD")',
    })
    const datePartResult = evaluateDatabaseFormula({
      ...context,
      expression: 'year(parseDate("2026-06-14")) + month(parseDate("2026-06-14"))',
    })
    const timestampResult = evaluateDatabaseFormula({
      ...context,
      expression: 'timestamp(parseDate("1970-01-01T00:00:01.000Z"))',
    })
    const numberResult = evaluateDatabaseFormula({
      ...context,
      expression: 'formatNumber(1234.567, "number", 2)',
    })
    const listResult = evaluateDatabaseFormula({
      ...context,
      expression: 'unique(sort(concat([3, 1], [2, 1]))).join("-")',
    })
    const trimResult = evaluateDatabaseFormula({
      ...context,
      expression: '" notion ".trim().upper()',
    })

    assert.deepEqual(dateResult, { ok: true, type: "text", value: "2026-06-14" })
    assert.deepEqual(datePartResult, { ok: true, type: "number", value: 2032 })
    assert.deepEqual(timestampResult, { ok: true, type: "number", value: 1000 })
    assert.deepEqual(numberResult, { ok: true, type: "text", value: "1,234.57" })
    assert.deepEqual(listResult, { ok: true, type: "text", value: "1-2-3" })
    assert.deepEqual(trimResult, { ok: true, type: "text", value: "NOTION" })
    assert.equal(formatFormulaValue(listResult.value), "1-2-3")
  })
}

function createFormulaContext({ extraProperties = [] } = {}) {
  const row = {
    createdAt: "2026-06-14T00:00:00.000Z",
    id: "row-1",
    page: {
      createdAt: "2026-06-14T00:00:00.000Z",
      id: "page-1",
      name: "Formula Notes",
      updatedAt: "2026-06-14T00:00:00.000Z",
    },
    pageId: "page-1",
    position: 0,
    updatedAt: "2026-06-14T00:00:00.000Z",
  }
  const properties = [
    createProperty(
      "database-property-full-name",
      "property-full-name",
      "Full Name",
      "text"
    ),
    createProperty("database-property-price", "property-price", "Price", "number"),
    createProperty(
      "database-property-quantity",
      "property-quantity",
      "Quantity",
      "number"
    ),
    createProperty("database-property-done", "property-done", "Done", "checkbox"),
    ...extraProperties,
  ]

  return {
    properties,
    propertyValuesByKey: {
      "page-1:property-done": "true",
      "page-1:property-full-name": "Ada Lovelace",
      "page-1:property-price": "12",
      "page-1:property-quantity": "3",
    },
    row,
    titlePropertyLabel: "Name",
  }
}

function createProperty(databasePropertyId, propertyId, name, type, config) {
  return {
    createdAt: "2026-06-14T00:00:00.000Z",
    databaseId: "database-1",
    id: databasePropertyId,
    position: 0,
    property: {
      config,
      createdAt: "2026-06-14T00:00:00.000Z",
      id: propertyId,
      name,
      workspaceId: "workspace-1",
      type,
      updatedAt: "2026-06-14T00:00:00.000Z",
    },
    propertyId,
    updatedAt: "2026-06-14T00:00:00.000Z",
    visible: true,
  }
}
