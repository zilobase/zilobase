import * as React from "react"
import { isDesktopApp } from "@/platform/desktop/native"

import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { getApiErrorMessage } from "@/platform/network/api"
import {
  desktopCloudConnectUrl,
  desktopServersReferToSameInstance,
  isCloudDesktopServer,
  listDesktopServerProfiles,
  prepareDesktopServerCandidate,
  type DesktopServerProfile,
} from "../../../platform/server/desktop-server"
import { executeDesktopServerSwitch } from "../server/desktop-server-switch"
import { DesktopDevCustomServerSelect } from "./desktop-dev-custom-server-select"

export function DesktopConnectServerDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [serverUrl, setServerUrl] = React.useState("")
  const [pending, setPending] = React.useState<"cloud" | "url" | "custom" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [profiles, setProfiles] = React.useState<DesktopServerProfile[]>([])

  React.useEffect(() => {
    if (!open || !isDesktopApp()) return
    let disposed = false
    void listDesktopServerProfiles()
      .then((result) => {
        if (!disposed) setProfiles(result.profiles)
      })
      .catch(() => {
        if (!disposed) setProfiles([])
      })
    return () => {
      disposed = true
    }
  }, [open])

  const cloudAlreadySaved = profiles.some((profile) =>
    isCloudDesktopServer(profile.server),
  )

  const connect = async (
    nextServerUrl: string,
    source: "url" | "custom" = "url",
  ) => {
    setPending(nextServerUrl === desktopCloudConnectUrl() ? "cloud" : source)
    setError(null)
    try {
      const prepared = await prepareDesktopServerCandidate(nextServerUrl)
      const existing = profiles.find((profile) =>
        desktopServersReferToSameInstance(profile.server, prepared.server),
      )
      if (existing?.active) {
        onOpenChange(false)
        return
      }
      await executeDesktopServerSwitch({
        candidateId: prepared.candidateId,
        hasCredentials: existing?.hasCredentials,
        path: existing?.hasCredentials
          ? (existing.lastPath ?? "/recents")
          : "/login",
        server: prepared.server,
        workspaceId: existing?.lastActiveWorkspaceId,
      })
    } catch (caught) {
      setPending(null)
      setError(getApiErrorMessage(caught))
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
        if (!next) {
          setServerUrl("")
          setError(null)
        }
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect another server</DialogTitle>
          <DialogDescription>
            Add Zilobase Cloud or a hosted instance. Servers already on this
            device stay signed in.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="py-2">
          {cloudAlreadySaved ? null : (
            <Field>
              <Button
                disabled={pending !== null}
                onClick={() => void connect(desktopCloudConnectUrl())}
                type="button"
              >
                {pending === "cloud"
                  ? "Connecting..."
                  : "Use Zilobase Cloud"}
              </Button>
            </Field>
          )}
          <DesktopDevCustomServerSelect
            disabled={pending !== null}
            onSelect={(nextServerUrl) => {
              void connect(nextServerUrl, "custom")
            }}
          />
          {cloudAlreadySaved ? null : (
            <FieldSeparator>Or use a hosted server</FieldSeparator>
          )}
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void connect(serverUrl)
            }}
          >
            <Field>
              <FieldLabel htmlFor="connect-another-server-url">
                Server URL
              </FieldLabel>
              <Input
                autoCapitalize="none"
                autoComplete="url"
                autoCorrect="off"
                disabled={pending !== null}
                id="connect-another-server-url"
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder="https://notes.example.com"
                required
                type="url"
                value={serverUrl}
              />
              <FieldDescription>
                HTTPS is required except for localhost development servers.
              </FieldDescription>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <DialogFooter>
              <Button
                disabled={pending !== null}
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending !== null} type="submit">
                {pending === "url" ? "Connecting..." : "Verify and continue"}
              </Button>
            </DialogFooter>
          </form>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  )
}
