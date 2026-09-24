export function register({ assert, loadModule, test }) {
  test("mail condition edits preserve property defaults, scalar coercion and explicit empty values", async () => {
    const { changeMailFilterCondition: change, defaultMailFilterValue: defaultValue } =
      await loadModule("/src/features/mail/organization/filter-condition.ts");
    const properties = [
      { id: "checked", propertyType: "checkbox", valueOptions: [] },
      { id: "number", propertyType: "number", valueOptions: [] },
      {
        id: "category",
        propertyType: "text",
        valueOptions: [{ value: "first" }],
      },
    ];
    const original = {
      id: "condition",
      type: "condition",
      propertyId: "old",
      operator: "is",
      values: ["old"],
      enabled: false,
    };
    assert.equal(defaultValue(properties[0]), true);
    assert.equal(defaultValue(properties[2]), "first");
    assert.equal(defaultValue(undefined), "");
    assert.deepEqual(
      change(original, { propertyId: "checked", values: ["false"] }, properties).values,
      [true],
    );
    assert.deepEqual(
      change(
        { ...original, propertyId: "checked" },
        { values: ["true", "false", "TRUE"] },
        properties,
      ).values,
      [true, false, false],
    );
    assert.deepEqual(change(original, { propertyId: "number" }, properties).values, [0]);
    assert.deepEqual(
      change({ ...original, propertyId: "number" }, { values: ["2.5", ""] }, properties).values,
      [2.5, 0],
    );
    assert.ok(
      Number.isNaN(
        change({ ...original, propertyId: "number" }, { values: ["invalid"] }, properties)
          .values[0],
      ),
    );
    assert.equal(change(original, { propertyId: "categories" }, properties).operator, "contains");
    assert.deepEqual(change(original, { propertyId: "missing" }, properties).values, [""]);
    const emptyId = change(
      original,
      { propertyId: "", operator: "is_not", values: [] },
      properties,
    );
    assert.equal(emptyId.propertyId, "");
    assert.equal(emptyId.operator, "is_not");
    assert.deepEqual(emptyId.values, []);
    assert.deepEqual(change(original, {}, properties), original);
    assert.deepEqual(original.values, ["old"]);
  });
}
