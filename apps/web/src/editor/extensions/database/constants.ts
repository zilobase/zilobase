import {
  ArrowUpRight,
  AtSign,
  BadgeCheck,
  BadgeHelp,
  Calendar,
  CheckSquare,
  CircleChevronDown,
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
  Sparkles,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react"

export const DATABASE_PAGE_DRAG_MIME = "application/x-notelab-database-page"

export const databaseColumnMinWidth = 180
export const databaseNameColumnDefaultWidth = 220
export const databaseAddPropertyColumnDefaultWidth = 180

export const defaultStatusOptions = [
  {
    color: "gray",
    group: "To-do",
    id: "not-started",
    name: "Not started",
  },
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

export type DatabasePropertyType = {
  icon: LucideIcon
  label: string
  type: string
}

export const databasePropertyTypes: DatabasePropertyType[][] = [
  [
    { icon: Type, label: "Text", type: "text" },
    { icon: Hash, label: "Number", type: "number" },
    { icon: CircleChevronDown, label: "Select", type: "select" },
    { icon: List, label: "Multi-select", type: "multi_select" },
    { icon: Sparkles, label: "Status", type: "status" },
    { icon: Calendar, label: "Date", type: "date" },
    { icon: Users, label: "Person", type: "person" },
    { icon: Paperclip, label: "Files & media", type: "files" },
    { icon: CheckSquare, label: "Checkbox", type: "checkbox" },
    { icon: Link, label: "URL", type: "url" },
    { icon: Phone, label: "Phone", type: "phone" },
    { icon: AtSign, label: "Email", type: "email" },
  ],
  [
    { icon: ArrowUpRight, label: "Relation", type: "relation" },
    { icon: Search, label: "Rollup", type: "rollup" },
    { icon: Sigma, label: "Formula", type: "formula" },
    { icon: MousePointerClick, label: "Button", type: "button" },
    { icon: BadgeHelp, label: "ID", type: "id" },
    { icon: MapPin, label: "Place", type: "place" },
    { icon: BadgeCheck, label: "Verification", type: "verification" },
  ],
  [
    { icon: Clock, label: "Created time", type: "created_time" },
    { icon: Clock, label: "Last edited time", type: "last_edited_time" },
  ],
]

export const databasePropertyTypeItems = databasePropertyTypes.flat()

export const textDatabasePropertyType =
  databasePropertyTypeItems.find((item) => item.type === "text") ??
  databasePropertyTypes[0][0]

export function getDatabasePropertyType(type: string) {
  return (
    databasePropertyTypeItems.find((item) => item.type === type) ??
    textDatabasePropertyType
  )
}
