"use client"

import { GalleryVerticalEndIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getApiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useCreateOrganization } from "@/features/organizations/hooks"

export function OnboardingForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate()
  const createOrganization = useCreateOrganization()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const organizationName = String(formData.get("organizationName") ?? "").trim()

    try {
      await createOrganization.mutateAsync(organizationName)
      void navigate({ to: "/dashboard" })
    } catch {
      // React Query owns the visible error state.
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="#"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-8 items-center justify-center rounded-md">
                <GalleryVerticalEndIcon className="size-6" />
              </div>
              <span className="sr-only">Notelab</span>
            </a>
            <h1 className="text-xl font-bold">Set up your workspace</h1>
            <FieldDescription>
              Tell us what to call your organization.
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="organization-name">
              Organization name
            </FieldLabel>
            <Input
              id="organization-name"
              name="organizationName"
              type="text"
              placeholder="Acme Inc."
              autoComplete="organization"
              disabled={createOrganization.isPending}
              required
            />
          </Field>
          {createOrganization.isError && (
            <FieldError>{getApiErrorMessage(createOrganization.error)}</FieldError>
          )}
          <Field>
            <Button type="submit" disabled={createOrganization.isPending}>
              {createOrganization.isPending ? "Creating workspace..." : "Continue"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
