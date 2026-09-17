import { deriveDatabaseViewModel } from "../model/database-view-model.ts"
import type { DatabaseFieldOption } from "../model/field-option"
import type { DatabaseSearchableMenuOption } from "../menu-option-contracts"
import { NameColumnGlyph } from "../../interactions/name-column-glyph"
import { getDatabasePropertyType } from "../../schema/property-catalog"

// Render field icons at the presentation boundary; row/config derivation is pure.
export function getDatabaseViewModel(input: Parameters<typeof deriveDatabaseViewModel>[0]) {
  const model = deriveDatabaseViewModel(input)
  const options = new Map<DatabaseFieldOption, DatabaseSearchableMenuOption>()
  const present = (option: DatabaseFieldOption): DatabaseSearchableMenuOption => {
    const existing = options.get(option)
    if (existing) return existing
    const { fieldIcon, ...data } = option
    const Icon = fieldIcon?.kind === "property" ? getDatabasePropertyType(fieldIcon.propertyType).icon : NameColumnGlyph
    const result = fieldIcon ? { ...data, icon: <Icon /> } : data
    options.set(option, result)
    return result
  }
  return {
    ...model,
    sortFieldOptions: model.sortFieldOptions.map(present),
    filterFieldOptions: model.filterFieldOptions.map(present),
    addableSortFieldOptions: model.addableSortFieldOptions.map(present),
    addableFilterFieldOptions: model.addableFilterFieldOptions.map(present),
    filterValueOptionsByField: Object.fromEntries(Object.entries(model.filterValueOptionsByField).map(([key, values]) => [key, values.map(present)])),
  }
}
