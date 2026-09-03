import { useState, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { mailApiBasePath, type MailConnection } from "@zilobase/features/mail"
import { toast } from "sonner"

import { apiFetch, getApiErrorMessage } from "@/features/desktop/network/api"
import { isDesktopApp } from "@/features/desktop/platform"
import { MainPaneHeaderLeadingControl, PagePaneHeader } from "@/features/pages/components"
import { PageSidePaneHeaderCell, PageSidePaneShell } from "@/features/pages/context"
import { GoogleIcon } from "@/shared/components/google-icon"
import { Loader2Icon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"

export function MailConnectionState({ connection, error, loading, onConnected, workspaceId }: {
  connection: MailConnection | null
  error: unknown
  loading: boolean
  onConnected: () => void
  workspaceId: string | null | undefined
}) {
  const [pending, setPending] = useState(false)
  const [connectError, setConnectError] = useState<unknown>(null)
  const connect = async () => {
    setPending(true)
    setConnectError(null)
    try {
      const result = await apiFetch<{ authorizationUrl: string }>(`${mailApiBasePath(workspaceId)}/oauth/start`, {
        body: JSON.stringify({ client: isDesktopApp() ? "desktop" : "web" }),
        method: "POST",
      })
      if (isDesktopApp()) {
        await invoke("open_mail_authorization_url", { authorizationUrl: result.authorizationUrl })
        toast.info("Finish connecting Gmail in your browser.")
        setPending(false)
      } else window.location.assign(result.authorizationUrl)
    } catch (connectionError) {
      setConnectError(connectionError)
      setPending(false)
    }
  }
  return (
    <MailCenteredState>
      <GoogleIcon className="size-7" />
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold text-content-primary">
          {connection?.status === "reconnect_required" ? "Reconnect Gmail" : "Connect your Gmail account"}
        </h1>
        <p className="max-w-sm text-sm leading-6 text-content-secondary">Read, organize, draft, and send Gmail from Zilobase. Gmail remains authoritative.</p>
      </div>
      <Button disabled={!workspaceId || loading || pending || connection?.providerConfigured === false} onClick={() => void connect()} type="button">
        <GoogleIcon /> {pending ? "Opening Google…" : "Connect Google account"}
      </Button>
      {connection?.providerConfigured === false ? <p className="text-center text-xs text-feedback-danger-text">Gmail is not configured on this Zilobase server.</p> : null}
      {error || connectError ? (
        <div className="space-y-2 text-center">
          <p className="text-xs text-feedback-danger-text">{getApiErrorMessage(connectError ?? error)}</p>
          <Button onClick={onConnected} size="sm" type="button" variant="outline">Try again</Button>
        </div>
      ) : null}
    </MailCenteredState>
  )
}

export function MailCenteredState({ children }: { children: ReactNode }) {
  return (
    <PageSidePaneShell
      body={<main className="grid min-h-0 flex-1 place-items-center bg-surface-canvas px-6"><section className="flex max-w-md flex-col items-center gap-5 py-12">{children}</section></main>}
      className="h-full bg-surface-canvas"
      header={<PageSidePaneHeaderCell className="z-10" side="main" splitActive={false}><PagePaneHeader className="min-w-0 flex-1" leadingControl={<MainPaneHeaderLeadingControl />} pathname="/mail" showActions={false} /></PageSidePaneHeaderCell>}
      open={false}
      visible={false}
    />
  )
}

export function MailboxLoading() {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-content-secondary"><Loader2Icon className="size-4 animate-spin" /> Preparing your mailbox</div>
}

export function MailEmptyState({ offline, query }: { offline: boolean; query: string }) {
  return <div className="py-16 text-center text-sm text-content-secondary">{query ? `No ${offline ? "downloaded " : ""}mail matches your search.` : "No mail in this folder."}</div>
}
