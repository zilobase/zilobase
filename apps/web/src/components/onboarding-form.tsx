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
import { useCreateWorkspace } from "@notelab/features/workspaces"

export function OnboardingForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate()
  const createWorkspace = useCreateWorkspace()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const workspaceName = String(formData.get("workspaceName") ?? "").trim()

    try {
      await createWorkspace.mutateAsync(workspaceName)
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
            <h1 className="text-xl font-bold">Set up your page</h1>
            <FieldDescription>
              Tell us what to call your workspace.
            </FieldDescription>
          </div>
          <Field>
            <FieldLabel htmlFor="workspace-name">
              Workspace name
            </FieldLabel>
            <Input
              id="workspace-name"
              name="workspaceName"
              type="text"
              placeholder="Acme Inc."
              autoComplete="workspace"
              disabled={createWorkspace.isPending}
              required
            />
          </Field>
          {createWorkspace.isError && (
            <FieldError>{getApiErrorMessage(createWorkspace.error)}</FieldError>
          )}
          <Field>
            <Button type="submit" disabled={createWorkspace.isPending}>
              {createWorkspace.isPending ? "Creating page..." : "Continue"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
