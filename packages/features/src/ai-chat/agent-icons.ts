import type {
  AgentIconColor,
  AgentIconName,
  AgentIconSpec,
} from "./live-agent"

const iconPaths: Record<AgentIconName, string> = {
  rocket:
    "M156,228a12,12,0,0,1-12,12H112a12,12,0,0,1,0-24h32A12,12,0,0,1,156,228ZM128,116a16,16,0,1,0-16-16A16,16,0,0,0,128,116Zm99.53,40.7-12.36,55.63a19.9,19.9,0,0,1-12.88,14.53A20.16,20.16,0,0,1,195.6,228a19.87,19.87,0,0,1-12.29-4.27L157.17,204H98.83L72.69,223.74A19.87,19.87,0,0,1,60.4,228a20.16,20.16,0,0,1-6.69-1.15,19.9,19.9,0,0,1-12.88-14.53L28.47,156.7a20.1,20.1,0,0,1,4.16-17.14l27.83-33.4A127,127,0,0,1,69.11,69.7c13.27-33.25,37-54.1,46.64-61.52a20,20,0,0,1,24.5,0c9.6,7.42,33.37,28.27,46.64,61.52a127,127,0,0,1,8.65,36.46l27.83,33.4A20.1,20.1,0,0,1,227.53,156.7ZM101.79,180h52.42c19.51-35.7,23-69.78,10.39-101.4C154.4,53,136.2,35.9,128,29.12,119.8,35.9,101.6,53,91.4,78.6,78.78,110.22,82.28,144.3,101.79,180Zm-22.55,8.72a168,168,0,0,1-16.92-47.3l-10,12,10.58,47.64Zm124.43-35.31-10-12a168,168,0,0,1-16.92,47.3l16.33,12.33Z",
  calendar:
    "M208,28H188V24a12,12,0,0,0-24,0v4H92V24a12,12,0,0,0-24,0v4H48A20,20,0,0,0,28,48V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V48A20,20,0,0,0,208,28ZM68,52a12,12,0,0,0,24,0h72a12,12,0,0,0,24,0h16V76H52V52ZM52,204V100H204V204Zm120.49-84.49a12,12,0,0,1,0,17l-48,48a12,12,0,0,1-17,0l-24-24a12,12,0,0,1,17-17L116,159l39.51-39.52A12,12,0,0,1,172.49,119.51Z",
  "check-circle":
    "M176.49,95.51a12,12,0,0,1,0,17l-56,56a12,12,0,0,1-17,0l-24-24a12,12,0,1,1,17-17L112,143l47.51-47.52A12,12,0,0,1,176.49,95.51ZM236,128A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128Z",
  bug:
    "M140,88a16,16,0,1,1,16,16A16,16,0,0,1,140,88ZM100,72a16,16,0,1,0,16,16A16,16,0,0,0,100,72Zm120,72a91.84,91.84,0,0,1-2.34,20.64L236.81,173a12,12,0,0,1-9.62,22l-18-7.85a92,92,0,0,1-162.46,0l-18,7.85a12,12,0,1,1-9.62-22l19.15-8.36A91.84,91.84,0,0,1,36,144v-4H16a12,12,0,0,1,0-24H36v-4a91.84,91.84,0,0,1,2.34-20.64L19.19,83a12,12,0,0,1,9.62-22l18,7.85a92,92,0,0,1,162.46,0l18-7.85a12,12,0,1,1,9.62,22l-19.15,8.36A91.84,91.84,0,0,1,220,112v4h20a12,12,0,0,1,0,24H220ZM60,116H196v-4a68,68,0,0,0-136,0Zm56,94.92V140H60v4A68.1,68.1,0,0,0,116,210.92ZM196,144v-4H140v70.92A68.1,68.1,0,0,0,196,144Z",
  users:
    "M125.18,156.94a64,64,0,1,0-82.36,0,100.23,100.23,0,0,0-39.49,32,12,12,0,0,0,19.35,14.2,76,76,0,0,1,122.64,0,12,12,0,0,0,19.36-14.2A100.33,100.33,0,0,0,125.18,156.94ZM44,108a40,40,0,1,1,40,40A40,40,0,0,1,44,108Zm206.1,97.67a12,12,0,0,1-16.78-2.57A76.31,76.31,0,0,0,172,172a12,12,0,0,1,0-24,40,40,0,1,0-10.3-78.67,12,12,0,1,1-6.16-23.19,64,64,0,0,1,57.64,110.8,100.23,100.23,0,0,1,39.49,32A12,12,0,0,1,250.1,205.67Z",
  target:
    "M229.26,90.4a108,108,0,0,1-177.63,114A108,108,0,0,1,195.41,43.63l20.1-20.11a12,12,0,0,1,17,17l-96,96a12,12,0,1,1-17-17l24-24a36,36,0,1,0,19.76,39.65,12,12,0,0,1,23.53,4.74,60,60,0,1,1-25.73-62L178.3,60.74a84,84,0,1,0,28.46,38,12,12,0,1,1,22.5-8.35Z",
  chart:
    "M224,196h-4V40a12,12,0,0,0-12-12H152a12,12,0,0,0-12,12V76H96A12,12,0,0,0,84,88v36H48a12,12,0,0,0-12,12v60H32a12,12,0,0,0,0,24H224a12,12,0,0,0,0-24ZM164,52h32V196H164Zm-56,48h32v96H108ZM60,148H84v48H60Z",
  book:
    "M232,44H160a43.86,43.86,0,0,0-32,13.85A43.86,43.86,0,0,0,96,44H24A12,12,0,0,0,12,56V200a12,12,0,0,0,12,12H96a20,20,0,0,1,20,20,12,12,0,0,0,24,0,20,20,0,0,1,20-20h72a12,12,0,0,0,12-12V56A12,12,0,0,0,232,44ZM96,188H36V68H96a20,20,0,0,1,20,20V192.81A43.79,43.79,0,0,0,96,188Zm124,0H160a43.71,43.71,0,0,0-20,4.83V88a20,20,0,0,1,20-20h60Z",
  briefcase:
    "M100,100a12,12,0,0,1,12-12h32a12,12,0,0,1,0,24H112A12,12,0,0,1,100,100ZM236,68V196a20,20,0,0,1-20,20H40a20,20,0,0,1-20-20V68A20,20,0,0,1,40,48H76V40a28,28,0,0,1,28-28h48a28,28,0,0,1,28,28v8h36A20,20,0,0,1,236,68ZM100,48h56V40a4,4,0,0,0-4-4H104a4,4,0,0,0-4,4ZM44,72v35.23A180.06,180.06,0,0,0,128,128a180,180,0,0,0,84-20.78V72ZM212,192V133.94A204.27,204.27,0,0,1,128,152a204.21,204.21,0,0,1-84-18.06V192Z",
  database:
    "M196,35.52C177.62,25.51,153.48,20,128,20S78.38,25.51,60,35.52C39.37,46.79,28,62.58,28,80v96c0,17.42,11.37,33.21,32,44.48,18.35,10,42.49,15.52,68,15.52s49.62-5.51,68-15.52c20.66-11.27,32-27.06,32-44.48V80C228,62.58,216.63,46.79,196,35.52ZM204,128c0,17-31.21,36-76,36s-76-19-76-36v-8.46a88.9,88.9,0,0,0,8,4.94c18.35,10,42.49,15.52,68,15.52s49.62-5.51,68-15.52a88.9,88.9,0,0,0,8-4.94ZM128,44c44.79,0,76,19,76,36s-31.21,36-76,36S52,97,52,80,83.21,44,128,44Zm0,168c-44.79,0-76-19-76-36v-8.46a88.9,88.9,0,0,0,8,4.94c18.35,10,42.49,15.52,68,15.52s49.62-5.51,68-15.52a88.9,88.9,0,0,0,8-4.94V176C204,193,172.79,212,128,212Z",
  list:
    "M76,64A12,12,0,0,1,88,52H216a12,12,0,0,1,0,24H88A12,12,0,0,1,76,64Zm140,52H88a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Zm0,64H88a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24ZM44,112a16,16,0,1,0,16,16A16,16,0,0,0,44,112Zm0-64A16,16,0,1,0,60,64,16,16,0,0,0,44,48Zm0,128a16,16,0,1,0,16,16A16,16,0,0,0,44,176Z",
  kanban:
    "M216,44H40A12,12,0,0,0,28,56V208a20,20,0,0,0,20,20H88a20,20,0,0,0,20-20V164h40v12a20,20,0,0,0,20,20h40a20,20,0,0,0,20-20V56A12,12,0,0,0,216,44Zm-12,64H172V68h32ZM84,68v40H52V68Zm0,136H52V132H84Zm24-64V68h40v72Zm64,32V132h32v40Z",
  file:
    "M216.49,79.52l-56-56A12,12,0,0,0,152,20H56A20,20,0,0,0,36,40V216a20,20,0,0,0,20,20H200a20,20,0,0,0,20-20V88A12,12,0,0,0,216.49,79.52ZM160,57l23,23H160ZM60,212V44h76V92a12,12,0,0,0,12,12h48V212Zm112-80a12,12,0,0,1-12,12H96a12,12,0,0,1,0-24h64A12,12,0,0,1,172,132Zm0,40a12,12,0,0,1-12,12H96a12,12,0,0,1,0-24h64A12,12,0,0,1,172,172Z",
  place:
    "M128,60a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,60Zm0,64a20,20,0,1,1,20-20A20,20,0,0,1,128,124Zm0-112a92.1,92.1,0,0,0-92,92c0,77.36,81.64,135.4,85.12,137.83a12,12,0,0,0,13.76,0,259,259,0,0,0,42.18-39C205.15,170.57,220,136.37,220,104A92.1,92.1,0,0,0,128,12Zm31.3,174.71A249.35,249.35,0,0,1,128,216.89a249.35,249.35,0,0,1-31.3-30.18C80,167.37,60,137.31,60,104a68,68,0,0,1,136,0C196,137.31,176,167.37,159.3,186.71Z",
}

export function buildAgentIconSvg(spec: AgentIconSpec) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" data-icon-color="${spec.color}" data-icon-library="phosphor" data-icon-weight="bold"><path d="${iconPaths[spec.name]}"></path></svg>`
}

export function buildAgentGlyphSvg(name: AgentIconName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" data-icon-library="phosphor" data-icon-weight="bold"><path d="${iconPaths[name]}"></path></svg>`
}

const semanticFallbacks: Array<{
  color: AgentIconColor
  icon: AgentIconName
  pattern: RegExp
}> = [
  { color: "orange", icon: "rocket", pattern: /release|launch|deploy/i },
  { color: "red", icon: "bug", pattern: /bug|risk|incident|issue/i },
  { color: "green", icon: "check-circle", pattern: /task|todo|checklist/i },
  { color: "blue", icon: "calendar", pattern: /calendar|date|schedule|meeting/i },
  { color: "purple", icon: "users", pattern: /people|person|crm|customer|team/i },
  { color: "yellow", icon: "book", pattern: /docs|documentation|wiki|knowledge|notes/i },
  { color: "blue", icon: "chart", pattern: /analytics|metric|report|dashboard/i },
  { color: "orange", icon: "briefcase", pattern: /project|portfolio|work/i },
  { color: "purple", icon: "target", pattern: /goal|objective|roadmap/i },
]

export function resolveAgentIconSpec(input: {
  fallbackKind: "database" | "page"
  name: string
  requested?: AgentIconSpec | null
}): AgentIconSpec {
  if (input.requested) return input.requested

  const semantic = semanticFallbacks.find((entry) =>
    entry.pattern.test(input.name)
  )
  if (semantic) return { color: semantic.color, name: semantic.icon }

  return input.fallbackKind === "database"
    ? { color: "blue", name: "database" }
    : { color: "gray", name: "file" }
}

export function resolveAgentGlyphName(input: {
  fallbackKind: "property" | "view"
  name: string
  requested?: AgentIconName | null
  type?: string | null
}): AgentIconName {
  if (input.requested) return input.requested

  if (input.fallbackKind === "view") {
    if (input.type === "kanban") return "kanban"
    if (input.type === "chart") return "chart"
    if (input.type === "timeline") return "calendar"
    return "list"
  }

  if (input.type === "status" || input.type === "checkbox") {
    return "check-circle"
  }
  if (
    input.type === "date" ||
    input.type === "created_time" ||
    input.type === "edited_time"
  ) {
    return "calendar"
  }
  if (input.type === "person") return "users"
  if (input.type === "place") return "place"

  const semantic = semanticFallbacks.find((entry) =>
    entry.pattern.test(input.name)
  )
  return semantic?.icon ?? "list"
}
