import {
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  BadgeHelp,
  Calendar,
  CircleChevronDown,
  CircleDashed,
  CheckSquare,
  Clock,
  Hash,
  Link,
  List,
  MapPin,
  MousePointerClick,
  Paperclip,
  Phone,
  Search,
  Sigma,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react"
import {
  isReadOnlyPropertyType as isCanonicalReadOnlyPropertyType,
  isSelectLikePropertyType as isCanonicalSelectLikePropertyType,
  type DatabasePropertyType as DatabasePropertyTypeId,
} from "@notelab/features/databases/property-types"
import { cyclingColorTokens } from "@/lib/color-tokens"

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

export type DatabasePropertyFilterKind =
  | "checkbox"
  | "date"
  | "files"
  | "number"
  | "person"
  | "text"

export type DatabasePropertyCellKind =
  | "button"
  | "checkbox"
  | "date"
  | "files"
  | "formula"
  | "input"
  | "person"
  | "read_only_time"
  | "relation"
  | "rollup"
  | "select"

export type DatabasePropertyType = {
  cellKind?: DatabasePropertyCellKind
  editable?: boolean
  filterKind: DatabasePropertyFilterKind
  hasEditSettings?: boolean
  icon: LucideIcon
  label: string
  type: DatabasePropertyTypeId
}

export const databasePropertyTypes: DatabasePropertyType[][] = [
  [
    { filterKind: "text", icon: Type, label: "Text", type: "text" },
    {
      filterKind: "number",
      hasEditSettings: true,
      icon: Hash,
      label: "Number",
      type: "number",
    },
    {
      cellKind: "select",
      filterKind: "text",
      hasEditSettings: true,
      icon: CircleChevronDown,
      label: "Select",
      type: "select",
    },
    {
      cellKind: "select",
      filterKind: "text",
      hasEditSettings: true,
      icon: List,
      label: "Multi-select",
      type: "multi_select",
    },
    {
      cellKind: "select",
      filterKind: "text",
      hasEditSettings: true,
      icon: CircleDashed,
      label: "Status",
      type: "status",
    },
    {
      cellKind: "date",
      filterKind: "date",
      hasEditSettings: true,
      icon: Calendar,
      label: "Date",
      type: "date",
    },
    {
      cellKind: "person",
      filterKind: "person",
      hasEditSettings: true,
      icon: Users,
      label: "Person",
      type: "person",
    },
    {
      cellKind: "files",
      filterKind: "files",
      hasEditSettings: true,
      icon: Paperclip,
      label: "Files & media",
      type: "files",
    },
    {
      cellKind: "checkbox",
      filterKind: "checkbox",
      icon: CheckSquare,
      label: "Checkbox",
      type: "checkbox",
    },
    {
      filterKind: "text",
      hasEditSettings: true,
      icon: Link,
      label: "URL",
      type: "url",
    },
    { filterKind: "text", icon: Phone, label: "Phone", type: "phone" },
    { filterKind: "text", icon: AtSign, label: "Email", type: "email" },
  ],
  [
    {
      cellKind: "relation",
      filterKind: "text",
      hasEditSettings: true,
      icon: ArrowUpRight,
      label: "Relation",
      type: "relation",
    },
    {
      cellKind: "rollup",
      filterKind: "text",
      hasEditSettings: true,
      icon: Search,
      label: "Rollup",
      type: "rollup",
    },
    {
      cellKind: "formula",
      filterKind: "text",
      icon: Sigma,
      label: "Formula",
      type: "formula",
    },
    {
      cellKind: "button",
      filterKind: "text",
      icon: MousePointerClick,
      label: "Button",
      type: "button",
    },
    { filterKind: "text", icon: BadgeHelp, label: "ID", type: "id" },
    { filterKind: "text", icon: MapPin, label: "Place", type: "place" },
    {
      filterKind: "text",
      icon: BadgeCheck,
      label: "Verification",
      type: "verification",
    },
  ],
  [
    {
      cellKind: "read_only_time",
      editable: false,
      filterKind: "date",
      hasEditSettings: true,
      icon: Clock,
      label: "Created time",
      type: "created_time",
    },
    {
      cellKind: "read_only_time",
      editable: false,
      filterKind: "date",
      hasEditSettings: true,
      icon: Clock,
      label: "Edited time",
      type: "edited_time",
    },
  ],
]

export const databasePropertyTypeItems = databasePropertyTypes.flat()

export function getNextDatabaseOptionColor(optionCount: number) {
  return (
    cyclingColorTokens[optionCount % cyclingColorTokens.length]?.value ?? "default"
  )
}

export const textDatabasePropertyType =
  databasePropertyTypeItems.find((item) => item.type === "text") ??
  databasePropertyTypes[0][0]

export function getDatabasePropertyType(type: string) {
  return (
    databasePropertyTypeItems.find((item) => item.type === type) ??
    textDatabasePropertyType
  )
}

export function getDatabasePropertyFilterKind(
  type: string
): DatabasePropertyFilterKind {
  return getDatabasePropertyType(type).filterKind
}

export function getDatabasePropertyCellKind(
  type: string
): DatabasePropertyCellKind {
  return getDatabasePropertyType(type).cellKind ?? "input"
}

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

export function hasDatabasePropertyTypeEditSettings(type: string) {
  return getDatabasePropertyType(type).hasEditSettings === true
}

export function isDateLikePropertyType(type: string) {
  return getDatabasePropertyFilterKind(type) === "date"
}

export function isReadOnlyPropertyType(type: string) {
  return isCanonicalReadOnlyPropertyType(type)
}

export function isSelectLikePropertyType(type: string) {
  return isCanonicalSelectLikePropertyType(type)
}
