import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BadgeCheckIcon, KeyRoundIcon, TicketIcon } from "lucide-react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch, getApiErrorMessage } from "@/lib/api"

type LicenseStatus = {
  tier: "community" | "professional" | "enterprise"
  seats: number | null
  features: string[]
  expiresAt: number | null
  isTrial: boolean
  valid: boolean
  inGrace: boolean
  error: string | null
}

const TIER_LABEL: Record<LicenseStatus["tier"], string> = {
  community: "Community",
  professional: "Team",
  enterprise: "Enterprise",
}

function useLicense() {
  return useQuery({
    queryKey: ["license"],
    queryFn: () => apiFetch<LicenseStatus>("/api/license", { auth: false }),
  })
}

export default function PlanSettingsPage() {
  const license = useLicense()

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Plan & License"
        description="Your current edition and how to activate a paid plan."
      />

      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <CurrentPlanCard status={license.data} isLoading={license.isLoading} />
        <ActivateCard tier={license.data?.tier ?? "community"} />
      </div>
    </main>
  )
}

function CurrentPlanCard({
  status,
  isLoading,
}: {
  status?: LicenseStatus
  isLoading: boolean
}) {
  if (isLoading || !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  const paid = status.tier !== "community"

  return (
    <Card>
      <CardHeader className="items-start gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {TIER_LABEL[status.tier]}
            {status.isTrial ? <Badge variant="outline">Trial</Badge> : null}
            {status.inGrace ? <Badge variant="outline">Grace period</Badge> : null}
          </CardTitle>
          <CardDescription>
            {paid
              ? `${status.seats ?? "Unlimited"} seats${
                  status.expiresAt
                    ? ` · renews ${formatDate(status.expiresAt)}`
                    : ""
                }`
              : "Free, self-hosted. Activate a key to unlock Team or Enterprise."}
          </CardDescription>
        </div>
        <Badge variant={paid ? "secondary" : "outline"}>
          <BadgeCheckIcon className="size-3.5" />
          {TIER_LABEL[status.tier]}
        </Badge>
      </CardHeader>

      {(!status.valid || status.error) && (
        <CardContent>
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {status.error ?? "The current license could not be verified."}
          </div>
        </CardContent>
      )}

      {paid && (
        <CardFooter>
          <DeactivateButton />
        </CardFooter>
      )}
    </Card>
  )
}

function ActivateCard({ tier }: { tier: LicenseStatus["tier"] }) {
  const queryClient = useQueryClient()
  const [code, setCode] = React.useState("")
  const [token, setToken] = React.useState("")

  const activate = useMutation({
    mutationFn: (body: { code?: string; token?: string }) =>
      apiFetch<LicenseStatus>("/api/license/activate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (status) => {
      queryClient.setQueryData(["license"], status)
      queryClient.invalidateQueries({ queryKey: ["license"] })
      setCode("")
      setToken("")
      toast.success(`Activated · ${TIER_LABEL[status.tier]} plan`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activate a plan</CardTitle>
        <CardDescription>
          Enter an activation code, or paste a license key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="code">
          <TabsList>
            <TabsTrigger value="code">
              <TicketIcon className="size-4" />
              Activation code
            </TabsTrigger>
            <TabsTrigger value="key">
              <KeyRoundIcon className="size-4" />
              License key
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="pt-4">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (code.trim()) activate.mutate({ code: code.trim() })
              }}
            >
              <Field>
                <FieldLabel htmlFor="activation-code">Activation code</FieldLabel>
                <Input
                  id="activation-code"
                  placeholder="TEAM-XXXX-XXXX"
                  autoComplete="off"
                  value={code}
                  disabled={activate.isPending}
                  onChange={(e) => setCode(e.target.value)}
                />
                <FieldDescription>
                  From your purchase confirmation. Activates against the license
                  server.
                </FieldDescription>
              </Field>
              <Button
                type="submit"
                className="w-fit"
                disabled={!code.trim() || activate.isPending}
              >
                {activate.isPending ? <Spinner /> : <TicketIcon />}
                Activate
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="key" className="pt-4">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (token.trim()) activate.mutate({ token: token.trim() })
              }}
            >
              <Field>
                <FieldLabel htmlFor="license-key">License key</FieldLabel>
                <Textarea
                  id="license-key"
                  placeholder="Paste your license key…"
                  className="min-h-24 font-mono text-xs"
                  value={token}
                  disabled={activate.isPending}
                  onChange={(e) => setToken(e.target.value)}
                />
                <FieldDescription>
                  Offline key — verified locally, works air-gapped.
                </FieldDescription>
              </Field>
              <Button
                type="submit"
                className="w-fit"
                disabled={!token.trim() || activate.isPending}
              >
                {activate.isPending ? <Spinner /> : <KeyRoundIcon />}
                Apply key
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function DeactivateButton() {
  const queryClient = useQueryClient()
  const deactivate = useMutation({
    mutationFn: () =>
      apiFetch<LicenseStatus>("/api/license/deactivate", { method: "POST" }),
    onSuccess: (status) => {
      queryClient.setQueryData(["license"], status)
      toast.success("License removed — back to Community.")
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={deactivate.isPending}
      onClick={() => deactivate.mutate()}
    >
      {deactivate.isPending ? <Spinner /> : null}
      Remove license
    </Button>
  )
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}
