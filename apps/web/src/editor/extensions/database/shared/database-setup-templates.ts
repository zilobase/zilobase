import { defaultStatusOptions } from "../constants"

export type DatabaseSetupTemplateId =
  | "tasks-tracker"
  | "projects"
  | "document-hub"
  | "content-calendar"
  | "meeting-notes"
  | "crm"

export type DatabaseSetupTemplateProperty = {
  config?: unknown
  name: string
  type: string
}

export type DatabaseSetupTemplate = {
  iconClassName: string
  id: DatabaseSetupTemplateId
  name: string
  properties: DatabaseSetupTemplateProperty[]
}

function getDefaultPropertyConfig(type: string) {
  if (type === "status") {
    return {
      defaultOptionId: defaultStatusOptions[0]?.id,
      options: defaultStatusOptions,
    }
  }

  return undefined
}

export const databaseSetupSuggestedTemplates: DatabaseSetupTemplate[] = [
  {
    iconClassName: "bg-emerald-600",
    id: "tasks-tracker",
    name: "Tasks Tracker",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Date", type: "date" },
      { name: "Person", type: "person" },
    ],
  },
  {
    iconClassName: "bg-blue-600",
    id: "projects",
    name: "Projects",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Date", type: "date" },
      { name: "Person", type: "person" },
    ],
  },
  {
    iconClassName: "bg-amber-700",
    id: "document-hub",
    name: "Document Hub",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Person", type: "person" },
      { name: "URL", type: "url" },
    ],
  },
]

export const databaseSetupMoreTemplates: DatabaseSetupTemplate[] = [
  {
    iconClassName: "bg-violet-600",
    id: "content-calendar",
    name: "Content Calendar",
    properties: [
      { name: "Date", type: "date" },
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Person", type: "person" },
    ],
  },
  {
    iconClassName: "bg-yellow-500",
    id: "meeting-notes",
    name: "Meeting Notes",
    properties: [
      { name: "Date", type: "date" },
      { name: "Person", type: "person" },
      { name: "Text", type: "text" },
    ],
  },
  {
    iconClassName: "bg-rose-700",
    id: "crm",
    name: "CRM",
    properties: [
      { config: getDefaultPropertyConfig("status"), name: "Status", type: "status" },
      { name: "Person", type: "person" },
      { name: "Email", type: "email" },
    ],
  },
]

export function getDatabaseSetupTemplate(
  templateId: DatabaseSetupTemplateId,
): DatabaseSetupTemplate | null {
  return (
    [...databaseSetupSuggestedTemplates, ...databaseSetupMoreTemplates].find(
      (template) => template.id === templateId,
    ) ?? null
  )
}

export function inferDatabaseSetupTemplateId(
  prompt: string,
): DatabaseSetupTemplateId | null {
  const normalized = prompt.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (/(task|todo|tracker)/.test(normalized)) {
    return "tasks-tracker"
  }

  if (/(project|roadmap|sprint)/.test(normalized)) {
    return "projects"
  }

  if (/(document|doc|wiki|hub)/.test(normalized)) {
    return "document-hub"
  }

  if (/(calendar|content|publish)/.test(normalized)) {
    return "content-calendar"
  }

  if (/(meeting|notes|standup)/.test(normalized)) {
    return "meeting-notes"
  }

  if (/(crm|customer|lead|sales)/.test(normalized)) {
    return "crm"
  }

  return null
}