import {
  normalizePropertyName,
  FormulaParser,
  tokenizeFormula,
  getFormulaExpression,
  type FormulaAst,
} from "../schema/formula";
import type { DatabasePropertyEntity } from "../core/entities";

/** Match the formula runtime's case-insensitive property-name lookup. */
export function dependentFields(
  properties: readonly DatabasePropertyEntity[],
  changed: ReadonlySet<string>,
  definitionsChanged = false,
) {
  const fields = new Set(changed);
  const names = new Map(
    properties.map((binding) => [normalizePropertyName(binding.property.name), binding.propertyId]),
  );
  const resolveName = (name: string) =>
    ["name", "title"].includes(normalizePropertyName(name))
      ? "name"
      : names.get(normalizePropertyName(name));
  const dependencies = new Map<string, Set<string>>();
  for (const binding of properties) {
    if (binding.property.type === "edited_time" || binding.property.type === "rollup")
      dependencies.set(binding.propertyId, new Set(["*"]));
    if (binding.property.type !== "formula") continue;
    const refs = new Set<string>();
    const visit = (ast: FormulaAst): void => {
      switch (ast.type) {
        case "identifier": {
          const id = resolveName(ast.name);
          if (id) refs.add(id);
          break;
        }
        case "call":
          if (ast.callee.type === "identifier" && ast.callee.name.toLowerCase() === "prop") {
            const argument = ast.arguments[0];
            if (argument?.type === "literal" && typeof argument.value === "string") {
              const id = resolveName(argument.value);
              if (id) refs.add(id);
            } else refs.add("*");
          } else if (ast.callee.type !== "identifier") visit(ast.callee);
          ast.arguments.forEach(visit);
          break;
        case "array":
          ast.elements.forEach(visit);
          break;
        case "binary":
          visit(ast.left);
          visit(ast.right);
          break;
        case "unary":
          visit(ast.argument);
          break;
        case "member":
          visit(ast.object);
          break;
        case "conditional":
          visit(ast.test);
          visit(ast.consequent);
          visit(ast.alternate);
          break;
        case "literal":
          break;
      }
    };
    try {
      visit(
        new FormulaParser(tokenizeFormula(getFormulaExpression(binding.property.config))).parse(),
      );
    } catch {
      refs.add("*");
    }
    if (definitionsChanged) refs.add("*");
    dependencies.set(binding.propertyId, refs);
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const binding of properties) {
      if (
        fields.has(binding.propertyId) ||
        fields.has(binding.id) ||
        [...(dependencies.get(binding.propertyId) ?? [])].some((id) => id === "*" || fields.has(id))
      ) {
        for (const id of [binding.id, binding.propertyId])
          if (!fields.has(id)) {
            fields.add(id);
            expanded = true;
          }
      }
    }
  }
  return fields;
}
