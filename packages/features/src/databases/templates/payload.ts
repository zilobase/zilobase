import { serializePropertyValue } from "../schema/property-values";
import type { ApplyDatabaseTemplateInput } from "../mutations/properties-operations";
import type { DatabaseSetupTemplate } from "./definitions";

export function databaseCsvPayload(csv: { headers: string[]; rows: string[][] }) {
  return {
    properties: csv.headers.slice(1).map((name) => ({ name, type: "text" })),
    rows: csv.rows.map((row, rowIndex) => ({
      title: row[0]?.trim() || `Row ${rowIndex + 1}`,
      values: csv.headers.slice(1).map((propertyName, index) => ({
        propertyName,
        value: serializePropertyValue("text", row[index + 1] ?? ""),
      })),
    })),
  };
}

export function databaseTemplateRows(
  template: DatabaseSetupTemplate,
  propertyTypesByName: Map<string, string>,
  content: (markdown: string) => unknown,
  metadata: (emoji: string) => unknown,
): ApplyDatabaseTemplateInput["rows"] {
  return template.sampleRows.map((sampleRow) => ({
    content: content(sampleRow.content),
    metadata: metadata(sampleRow.emoji),
    title: sampleRow.title,
    values: Object.entries(sampleRow.values ?? {}).flatMap(([propertyName, value]) => {
      const propertyType = propertyTypesByName.get(propertyName.toLowerCase());
      return propertyType
        ? [{ propertyName, value: serializePropertyValue(propertyType, value) }]
        : [];
    }),
  }));
}
