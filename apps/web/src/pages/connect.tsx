import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import {
  desktopCloudConnectUrl,
  getSelectedDesktopServer,
  isCloudDesktopServer,
  listDesktopServerProfiles,
  type DesktopServerProfile,
} from "@/lib/desktop-server"
import { requestDesktopServerReplacement } from "@/lib/desktop-server-replacement"
import { executeDesktopServerSwitch } from "@/lib/desktop-server-switch"

export default function ConnectPage() {
  const navigate = useNavigate()
  const server = getSelectedDesktopServer()
  const onCloud = isCloudDesktopServer(server)
  const [serverUrl, setServerUrl] = useState("")
  const [profiles, setProfiles] = useState<DesktopServerProfile[]>([])

  useEffect(() => {
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
  }, [])

  const otherProfiles = profiles.filter((profile) => !profile.active)

  const continueWithCurrent = () => {
    void navigate({ to: "/login" })
  }

  const useCloud = () => {
    if (onCloud) {
      continueWithCurrent()
      return
    }
    requestDesktopServerReplacement({
      path: "/login",
      serverUrl: desktopCloudConnectUrl(),
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2">
          <ZilobaseLogo className="h-7 w-auto" />
          <span className="font-medium">Zilobase</span>
        </div>

        <div>
          <h1 className="text-lg font-semibold">Choose a server</h1>
          <FieldDescription>
            Start with Zilobase Cloud or connect a hosted instance, then
            continue in your browser.
          </FieldDescription>
        </div>

        <FieldGroup>
          <Field>
            <Button onClick={useCloud} type="button">
              {onCloud ? "Continue with Zilobase Cloud" : "Use Zilobase Cloud"}
            </Button>
          </Field>

          {server && !onCloud ? (
            <Field>
              <Button
                onClick={continueWithCurrent}
                type="button"
                variant="outline"
              >
                Continue with {server.displayName}
              </Button>
            </Field>
          ) : null}

          {otherProfiles.map((profile) => (
            <Field key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}>
              <Button
                onClick={() => {
                  void executeDesktopServerSwitch({
                    hasCredentials: profile.hasCredentials,
                    path: profile.hasCredentials
                      ? (profile.lastPath ?? "/recents")
                      : "/login",
                    server: profile.server,
                    workspaceId: profile.lastActiveWorkspaceId,
                  })
                }}
                type="button"
                variant="outline"
              >
                Continue with {profile.server.displayName}
              </Button>
            </Field>
          ))}

          <FieldSeparator>Or use a hosted server</FieldSeparator>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              requestDesktopServerReplacement({ path: "/login", serverUrl })
              setServerUrl("")
            }}
          >
            <Field>
              <FieldLabel htmlFor="desktop-server-url">Server URL</FieldLabel>
              <Input
                autoCapitalize="none"
                autoComplete="url"
                autoCorrect="off"
                id="desktop-server-url"
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
            <Field>
              <Button type="submit">Verify and continue</Button>
            </Field>
          </form>
        </FieldGroup>
      </div>
    </main>
  )
}
