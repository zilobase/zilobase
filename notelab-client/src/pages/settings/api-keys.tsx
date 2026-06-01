import * as React from "react"
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useUpdateApiKey,
} from "@/features/api-keys/hooks"
import type { ApiKeyRecord, CreatedApiKeyRecord } from "@/features/api-keys/queries"
import { useActiveOrganizationId } from "@/features/integrations/hooks"
import { useOrganizations } from "@/features/organizations/hooks"
import { getApiErrorMessage } from "@/lib/api"

const expirationOptions = [
  { label: "90 days", value: "7776000" },
  { label: "30 days", value: "2592000" },
  { label: "1 year", value: "31536000" },
  { label: "No expiry", value: "none" },
] as const

export default function ApiKeysSettingsPage() {
  const activeOrganizationId = useActiveOrganizationId()
  const { data: organizations = [] } = useOrganizations()
  const [selectedOrganizationId, setSelectedOrganizationId] = React.useState<
    string | null
  >(activeOrganizationId ?? null)

  React.useEffect(() => {
    if (!selectedOrganizationId && activeOrganizationId) {
      setSelectedOrganizationId(activeOrganizationId)
    }
  }, [activeOrganizationId, selectedOrganizationId])

  const apiKeys = useApiKeys(selectedOrganizationId)
  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId,
  )

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="API Keys"
        description="Create user-scoped keys for programmatic Notelab access."
      />

      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card>
          <CardHeader className="items-start gap-4 sm:flex-row sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Keys</CardTitle>
              <CardDescription>
                Keys inherit your current permissions in the selected organization.
              </CardDescription>
            </div>
            <CreateApiKeyDialog
              disabled={!selectedOrganizationId}
              organizationId={selectedOrganizationId}
            />
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field>
              <FieldLabel>Organization</FieldLabel>
              <Select
                disabled={organizations.length === 0}
                onValueChange={setSelectedOrganizationId}
                value={selectedOrganizationId ?? undefined}
              >
                <SelectTrigger className="w-full sm:max-w-sm">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                External requests made with a key stay pinned to this organization.
              </FieldDescription>
            </Field>

            <ApiKeyList
              isLoading={apiKeys.isLoading}
              keys={apiKeys.data?.keys ?? []}
              organizationName={selectedOrganization?.name ?? "this organization"}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function CreateApiKeyDialog({
  disabled,
  organizationId,
}: {
  disabled: boolean
  organizationId: string | null
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

    if (!organizationId) {
      toast.error("Select an organization before creating a key.")
      return
    }

    createApiKey.mutate(
      {
        expiresIn: expiration === "none" ? null : Number(expiration),
        name: trimmedName,
        organizationId,
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
        <Button disabled={disabled} size="sm" type="button">
          <PlusIcon />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            The full key is shown once after creation.
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
      <div className="rounded-md border bg-muted/40 p-3">
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
  organizationName,
}: {
  isLoading: boolean
  keys: ApiKeyRecord[]
  organizationName: string
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
            Create a key to access {organizationName} from external services.
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
    if (!apiKey.organizationId) {
      return
    }

    updateApiKey.mutate(
      {
        enabled: !apiKey.enabled,
        id: apiKey.id,
        organizationId: apiKey.organizationId,
      },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
      },
    )
  }

  const revoke = () => {
    if (!apiKey.organizationId) {
      return
    }

    deleteApiKey.mutate(
      {
        id: apiKey.id,
        organizationId: apiKey.organizationId,
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
            size="sm"
            type="button"
            variant="outline"
          >
            {updateApiKey.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {apiKey.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => setConfirmOpen(true)}
            size="sm"
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
