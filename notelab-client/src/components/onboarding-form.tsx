"use client"

import { GalleryVerticalEndIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function OnboardingForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form>
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
              required
            />
          </Field>
          <Field>
            <Button type="submit">Continue</Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
