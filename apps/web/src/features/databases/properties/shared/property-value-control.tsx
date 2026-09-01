import type { MailCustomPropertyType, MailPropertyOption, MailPropertyWorkspaceMember, MailThreadPropertyValue } from "@zilobase/features/mail"

import { Input } from "@/shared/ui/input"
import { Checkbox } from "@/shared/ui/checkbox"

type PropertyValue = MailThreadPropertyValue["value"]

export function DataSourcePropertyValueControl({
  disabled = false,
  members = [],
  onChange,
  options = [],
  type,
  value,
}: {
  disabled?: boolean
  members?: MailPropertyWorkspaceMember[]
  onChange: (value: PropertyValue) => void
  options?: MailPropertyOption[]
  type: MailCustomPropertyType
  value: PropertyValue | undefined
}) {
  if (type === "checkbox") {
    return <Checkbox aria-label="Property value" checked={value === true} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true)} />
  }

  if (type === "select" || type === "status") {
    return (
      <select
        aria-label="Property value"
        className="h-7 min-w-32 rounded-md border border-control-border bg-surface-canvas px-2 text-xs text-content-primary outline-none focus:border-action-focus-ring"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">Empty</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    )
  }

  if (type === "multi_select" || type === "person") {
    const choices = type === "person"
      ? members.map((member) => ({ id: member.id, name: member.name || member.email }))
      : options
    const selected = new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [])
    return (
      <div className="flex min-w-0 flex-wrap gap-1" aria-label="Property value">
        {choices.map((choice) => {
          const active = selected.has(choice.id)
          return (
            <button
              aria-pressed={active}
              className={`rounded px-1.5 py-0.5 text-xs ${active ? "bg-action-primary text-action-on-primary" : "bg-surface-subtle text-content-secondary hover:bg-action-neutral-hover"}`}
              disabled={disabled}
              key={choice.id}
              onClick={() => onChange(active ? [...selected].filter((id) => id !== choice.id) : [...selected, choice.id])}
              type="button"
            >
              {choice.name}
            </button>
          )
        })}
        {!choices.length ? <span className="text-xs text-content-secondary">No choices</span> : null}
      </div>
    )
  }

  if (type === "files") {
    const files = Array.isArray(value)
      ? value.filter((item): item is { id: string; name: string; url: string } => item !== null && typeof item === "object" && "url" in item)
      : []
    return (
      <div className="flex min-w-0 items-center gap-1">
        {files.map((file) => <span className="inline-flex min-w-0 items-center gap-0.5" key={file.id}><a className="max-w-28 truncate text-xs text-action-link" href={file.url} rel="noreferrer" target="_blank">{file.name}</a><button aria-label={`Remove ${file.name}`} className="text-xs text-content-secondary" disabled={disabled} onClick={() => onChange(files.filter((item) => item.id !== file.id))} type="button">×</button></span>)}
        <Input
          aria-label="Add file URL"
          className="min-w-32"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const url = event.currentTarget.value.trim()
            if (!url) return
            onChange([...files, { id: crypto.randomUUID(), name: fileName(url), url }])
            event.currentTarget.value = ""
          }}
          placeholder="Paste URL, press Enter"
          type="url"
        />
      </div>
    )
  }

  const scalar = typeof value === "string" || typeof value === "number" ? value : ""
  return (
    <Input
      aria-label="Property value"
      disabled={disabled}
      onChange={(event) => onChange(type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)}
      placeholder={type === "url" ? "https://…" : "Empty"}
      type={type === "number" ? "number" : type === "date" ? "date" : type === "url" ? "url" : "text"}
      value={scalar}
    />
  )
}

function fileName(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? url
  } catch {
    return url
  }
}
