import type { DatabaseProperty } from "@zilobase/features/databases"
import { defaultStatusOptions } from "../../../core/database-property-types"
import { getPersonLimit } from "../../model/database-view-config"
import { getRelationLimit } from "../../../properties/relations/model/database-relation-sync"

export type FormOption = {
  color?: string
  id: string
  name: string
  suffix?: string
}

function isFormOption(value: unknown): value is FormOption {
  return Boolean(
    value && typeof value === "object" &&
    "id" in value && typeof value.id === "string" &&
    "name" in value && typeof value.name === "string"
  )
}

export function getFormOptions(
  type: string,
  config: unknown,
  personOptions: Array<{ id: string; name: string; suffix?: string }>
): FormOption[] {
  if (type === "person") return personOptions

  const configuredOptions = config && typeof config === "object" && "options" in config
    ? (config as { options?: unknown }).options
    : undefined
  const options = Array.isArray(configuredOptions)
    ? configuredOptions.filter(isFormOption)
    : []

  return type === "status" && options.length === 0 ? defaultStatusOptions : options
}

export function isOptionProperty(property: DatabaseProperty) {
  return ["select", "status", "multi_select"].includes(property.property.type)
}

export function getFormQuestionDescription(property: DatabaseProperty) {
  const type = property.property.type
  const config = property.property.config

  if (
    type === "multi_select" ||
    (type === "person" && getPersonLimit(config) !== "one_person") ||
    (type === "relation" && getRelationLimit(config) !== "one_page") ||
    (type === "files" && getFilesLimit(config) !== "one_file")
  ) return "Respondents can select as many as they like"

  if (
    (type === "person" && getPersonLimit(config) === "one_person") ||
    (type === "relation" && getRelationLimit(config) === "one_page") ||
    (type === "files" && getFilesLimit(config) === "one_file")
  ) return "Respondents can select up to 1"

  return undefined
}

function getFilesLimit(config: unknown) {
  return config && typeof config === "object" && !Array.isArray(config) &&
    "filesLimit" in config && config.filesLimit === "one_file"
    ? "one_file"
    : "no_limit"
}
