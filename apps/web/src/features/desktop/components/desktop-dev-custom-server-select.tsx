import * as React from "react"

import { desktopDevelopmentTargets } from "@/features/desktop/server/index"
import { Field, FieldLabel } from "@/shared/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"

export function DesktopDevCustomServerSelect({
  disabled,
  onSelect,
}: {
  disabled?: boolean
  onSelect: (serverUrl: string) => void
}) {
  const [generation, setGeneration] = React.useState(0)
  if (!import.meta.env.DEV) return null
  const servers = desktopDevelopmentTargets().customServers
  if (servers.length === 0) return null

  return (
    <Field>
      <FieldLabel htmlFor="desktop-dev-custom-server">Choose custom server</FieldLabel>
      <Select
        disabled={disabled}
        key={generation}
        onValueChange={(serverUrl) => {
          setGeneration((current) => current + 1)
          onSelect(serverUrl)
        }}
      >
        <SelectTrigger className="w-full" id="desktop-dev-custom-server">
          <SelectValue placeholder="Choose custom server" />
        </SelectTrigger>
        <SelectContent>
          {servers.map((server) => (
            <SelectItem key={server.url} value={server.url}>
              {server.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
