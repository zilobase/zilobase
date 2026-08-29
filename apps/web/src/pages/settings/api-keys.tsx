import * as React from "react"
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "@/shared/components/icons"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui/empty"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shared/ui/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { Skeleton } from "@/shared/ui/skeleton"
import { Spinner } from "@/shared/ui/spinner"
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useUpdateApiKey,
} from "@zilobase/features/api-keys"
import type { ApiKeyRecord, CreatedApiKeyRecord } from "@zilobase/features/api-keys"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import { useWorkspaces } from "@zilobase/features/workspaces"
import { getApiErrorMessage } from "@/lib/api"

const expirationOptions = [
  { label: "90 days", value: "7776000" },
  { label: "30 days", value: "2592000" },
  { label: "1 year", value: "31536000" },
  { label: "No expiry", value: "none" },
] as const

export default function ApiKeysSettingsPage() {
  const activeWorkspaceId = useActiveWorkspaceId()
  const { data: workspaces = [] } = useWorkspaces()
  const apiKeys = useApiKeys(activeWorkspaceId ?? null)
  const activeWorkspace = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  )
  const workspaceName = activeWorkspace?.name ?? "Current workspace"

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="API Keys"
        description="Create user-scoped keys for programmatic Zilobase access."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <section className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-heading text-base leading-snug font-medium">
                Keys for {workspaceName}
              </h3>
              <p className="text-sm text-muted-foreground">
                {activeWorkspace
                  ? `These keys are scoped to your current workspace, ${workspaceName}, and inherit your permissions there.`
                  : "These keys are scoped to your current workspace and inherit your permissions there."}
              </p>
            </div>
            <CreateApiKeyDialog
              disabled={!activeWorkspaceId}
              workspaceId={activeWorkspaceId ?? null}
              workspaceName={workspaceName}
            />
          </div>
          <ApiKeyList
            isLoading={apiKeys.isLoading}
            keys={apiKeys.data?.keys ?? []}
            workspaceName={workspaceName}
          />
        </section>
      </div>
    </main>
  )
}

function CreateApiKeyDialog({
  disabled,
  workspaceId,
  workspaceName,
}: {
  disabled: boolean
  workspaceId: string | null
  workspaceName: string
}) {
  const createApiKey = useCreateApiKey()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [expiration, setExpiration] = React.useState("7776000")
  const [createdKey, setCreatedKey] = React.useState<CreatedApiKeyRecord | null>(
    null,
  )
  const trimmedName = name.trim()

  const createKey = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!workspaceId) {
      toast.error("The current workspace is unavailable.")
      return
    }

    createApiKey.mutate(
      {
        expiresIn: expiration === "none" ? null : Number(expiration),
        name: trimmedName,
        workspaceId,
      },
      {
        onSuccess: (result) => {
          setCreatedKey(result.key)
          setName("")
          setExpiration("7776000")
          toast.success("API key created.")
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error))
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setCreatedKey(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled} type="button">
          <PlusIcon />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key for {workspaceName}</DialogTitle>
          <DialogDescription>
            This key is scoped to {workspaceName}. The full key is shown once
            after creation.
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <CreatedKeyPanel apiKey={createdKey} />
        ) : (
          <form className="grid gap-4" onSubmit={createKey}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                <Input
                  autoComplete="off"
                  disabled={createApiKey.isPending}
                  id="api-key-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Production sync"
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel>Expiration</FieldLabel>
                <Select
                  disabled={createApiKey.isPending}
                  onValueChange={setExpiration}
                  value={expiration}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expirationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                disabled={!trimmedName || createApiKey.isPending}
                type="submit"
              >
                {createApiKey.isPending ? <Spinner /> : <KeyRoundIcon />}
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CreatedKeyPanel({ apiKey }: { apiKey: CreatedApiKeyRecord }) {
  const [copied, setCopied] = React.useState(false)

  const copyKey = async () => {
    await navigator.clipboard.writeText(apiKey.key)
    setCopied(true)
    toast.success("API key copied.")
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-md border bg-subtle-surface p-3">
        <div className="break-all font-mono text-sm">{apiKey.key}</div>
      </div>
      <Button className="w-fit" onClick={copyKey} type="button">
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy key"}
      </Button>
    </div>
  )
}

function ApiKeyList({
  isLoading,
  keys,
  workspaceName,
}: {
  isLoading: boolean
  keys: ApiKeyRecord[]
  workspaceName: string
}) {
  if (isLoading) {
    return <RowsSkeleton />
  }

  if (keys.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRoundIcon />
          </EmptyMedia>
          <EmptyTitle>No API keys</EmptyTitle>
          <EmptyDescription>
            Create a key to access {workspaceName} from external services.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ItemGroup className="gap-2">
      {keys.map((apiKey) => (
        <ApiKeyRow apiKey={apiKey} key={apiKey.id} />
      ))}
    </ItemGroup>
  )
}

function ApiKeyRow({ apiKey }: { apiKey: ApiKeyRecord }) {
  const updateApiKey = useUpdateApiKey()
  const deleteApiKey = useDeleteApiKey()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const isExpired = apiKey.expiresAt
    ? new Date(apiKey.expiresAt).getTime() <= Date.now()
    : false
  const isBusy = updateApiKey.isPending || deleteApiKey.isPending

  const toggleEnabled = () => {
    if (!apiKey.workspaceId) {
      return
    }

    updateApiKey.mutate(
      {
        enabled: !apiKey.enabled,
        id: apiKey.id,
        workspaceId: apiKey.workspaceId,
      },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
      },
    )
  }

  const revoke = () => {
    if (!apiKey.workspaceId) {
      return
    }

    deleteApiKey.mutate(
      {
        id: apiKey.id,
        workspaceId: apiKey.workspaceId,
      },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          toast.success("API key revoked.")
        },
        onError: (error) => toast.error(getApiErrorMessage(error)),
      },
    )
  }

  return (
    <>
      <Item variant="outline">
        <ItemMedia className="size-10 rounded-lg border bg-background">
          <KeyRoundIcon className="size-5" />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ItemTitle className="truncate">{apiKey.name}</ItemTitle>
            <Badge variant={apiKey.enabled && !isExpired ? "secondary" : "outline"}>
              {isExpired ? "Expired" : apiKey.enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <ItemDescription className="line-clamp-2">
            {apiKey.start ?? apiKey.prefix ?? "Key"} - Created{" "}
            {formatDate(apiKey.createdAt)} - Expires{" "}
            {apiKey.expiresAt ? formatDate(apiKey.expiresAt) : "never"}
            {apiKey.lastRequest
              ? ` - Last used ${formatDate(apiKey.lastRequest)}`
              : ""}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            disabled={isBusy || isExpired}
            onClick={toggleEnabled}
            type="button"
            variant="outline"
          >
            {updateApiKey.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {apiKey.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => setConfirmOpen(true)}
            type="button"
            variant="outline"
          >
            <Trash2Icon />
            Revoke
          </Button>
        </ItemActions>
      </Item>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately stops external services using this key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revoke}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function RowsSkeleton() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton className="h-16 rounded-lg" key={index} />
      ))}
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
