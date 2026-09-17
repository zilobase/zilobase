import { isReadOnlyPropertyType as isCanonicalReadOnlyPropertyType, isSelectLikePropertyType as isCanonicalSelectLikePropertyType } from "@zilobase/features/databases/property-types"

export const defaultStatusOption = {
  color: "gray",
  group: "To-do",
  id: "not-started",
  name: "Not started",
}

export const defaultStatusOptions = [
  defaultStatusOption,
  {
    color: "blue",
    group: "In progress",
    id: "in-progress",
    name: "In progress",
  },
  {
    color: "green",
    group: "Complete",
    id: "done",
    name: "Done",
  },
]

export function getDefaultDatabasePropertyConfig(type: string) {
  if (type === "status") {
    return {
      defaultOptionId: defaultStatusOption.id,
      options: defaultStatusOptions,
    }
  }

  if (type === "formula") {
    return { formula: "" }
  }

  return undefined
}

export function isReadOnlyPropertyType(type: string) {
  return isCanonicalReadOnlyPropertyType(type)
}

export function isSelectLikePropertyType(type: string) {
  return isCanonicalSelectLikePropertyType(type)
}
