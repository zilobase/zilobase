/** Derive family interests from retained Query references, never from entity copies. */
export function referenceInterests(
  input: unknown,
  queryKey: readonly unknown[],
  into = new Map<string, Set<string>>(),
) {
  const seen = new WeakSet<object>();
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, path));
      return;
    }
    const row = value as Record<string, unknown>;
    if (typeof row.cacheId === "string") {
      const families = into.get(row.cacheId) ?? new Set<string>();
      into.set(row.cacheId, families);
      const add = (...names: string[]) => names.forEach((name) => families.add(name));
      if (Array.isArray(row.sourceIds)) {
        add(
          "database-hosts",
          "sources",
          "source-links",
          "views",
          "database-context-facets",
          "database-preferences",
        );
        if (Array.isArray(row.bindingIds)) add("property-definitions", "property-bindings");
      } else if (Array.isArray(row.recordIds)) {
        add(
          "records",
          "pages",
          "property-values",
          "property-definitions",
          "property-bindings",
          "database-hosts",
          "sources",
          "source-links",
        );
      } else if (Array.isArray(row.propertyIds)) {
        add("property-definitions", "property-values", "pages");
      } else if (path === "access") {
        add(queryKey[0] === "page" ? "page-access-facets" : "database-access-facets");
      } else if (path === "placements") add("placements");
      else if (row.type === "database") add("database-hosts");
      else add("pages", "page-preferences");
    }
    // Complete exports contain rows alongside their bootstrap reference.
    if (
      row.bootstrap &&
      typeof row.bootstrap === "object" &&
      "cacheId" in row.bootstrap &&
      typeof row.bootstrap.cacheId === "string"
    ) {
      const families = into.get(row.bootstrap.cacheId) ?? new Set<string>();
      ["records", "pages", "property-values"].forEach((name) => families.add(name));
      into.set(row.bootstrap.cacheId, families);
    }
    for (const [key, item] of Object.entries(row)) {
      if (key !== "context" && key !== "content") visit(item, key);
    }
  };
  visit(input, "");
  return into;
}
