"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useSession } from "@/features/auth/hooks"
import {
  useCreateOrganization,
  useOrganizations,
  useSetActiveOrganization,
} from "@/features/organizations/hooks"
import { getApiErrorMessage } from "@/lib/api"
import { useAppStore } from "@/stores/app-store"
import { Building2Icon, ChevronDownIcon, PlusIcon } from "lucide-react"

export function OrganizationSwitcher() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
  const { data: sessionData } = useSession()
  const { data: organizations = [], isError, isLoading } = useOrganizations()
  const createOrganization = useCreateOrganization()
  const setActiveOrganization = useSetActiveOrganization()
  const storedActiveOrganizationId = useAppStore((state) => state.activeOrganizationId)

  const activeOrganizationId =
    sessionData?.session?.activeOrganizationId ?? storedActiveOrganizationId
  const activeOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ??
    organizations[0]

  async function handleCreateOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const form = event.currentTarget
    const formData = new FormData(form)
    const organizationName = String(formData.get("organizationName") ?? "").trim()

    try {
      await createOrganization.mutateAsync(organizationName)
      form.reset()
      setIsCreateDialogOpen(false)
    } catch {
      // React Query owns the visible error state.
    }
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="w-fit max-w-full px-1.5"
                disabled={isLoading || organizations.length === 0}
              >
                <div className="flex aspect-square size-5 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  {activeOrganization ? (
                    <span className="text-[10px] font-semibold">
                      {getOrganizationInitials(activeOrganization.name)}
                    </span>
                  ) : (
                    <Building2Icon className="size-3.5" />
                  )}
                </div>
                <span className="truncate font-medium">
                  {readTriggerLabel({
                    activeOrganizationName: activeOrganization?.name,
                    isError,
                    isLoading,
                  })}
                </span>
                <ChevronDownIcon className="opacity-50" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 rounded-lg"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizations
              </DropdownMenuLabel>
              {organizations.map((organization, index) => (
                <DropdownMenuItem
                  key={organization.id}
                  onClick={() => setActiveOrganization.mutate(organization.id)}
                  disabled={
                    organization.id === activeOrganization?.id ||
                    setActiveOrganization.isPending
                  }
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-xs border">
                    <span className="text-xs font-medium">
                      {getOrganizationInitials(organization.name)}
                    </span>
                  </div>
                  <span className="truncate">{organization.name}</span>
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 p-2"
                onSelect={() => setIsCreateDialogOpen(true)}
              >
                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Add organization
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <form onSubmit={handleCreateOrganization}>
            <DialogHeader>
              <DialogTitle>Add organization</DialogTitle>
              <DialogDescription>
                Create a new organization and switch to it.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="new-organization-name">
                  Organization name
                </FieldLabel>
                <Input
                  id="new-organization-name"
                  name="organizationName"
                  placeholder="Acme Inc."
                  autoComplete="organization"
                  disabled={createOrganization.isPending}
                  required
                />
              </Field>
              {createOrganization.isError && (
                <FieldError>
                  {getApiErrorMessage(createOrganization.error)}
                </FieldError>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={createOrganization.isPending}
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createOrganization.isPending}>
                {createOrganization.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function readTriggerLabel({
  activeOrganizationName,
  isError,
  isLoading,
}: {
  activeOrganizationName?: string
  isError: boolean
  isLoading: boolean
}) {
  if (isLoading) {
    return "Loading..."
  }

  if (isError) {
    return "Unable to load"
  }

  return activeOrganizationName ?? "No organizations"
}

function getOrganizationInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

  return initials || "N"
}
