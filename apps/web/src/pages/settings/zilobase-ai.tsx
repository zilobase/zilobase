import * as React from "react"

import { SettingsHeader } from "@/components/settings-header"
import { Separator } from "@/shared/ui/separator"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  useAiAgentPreference,
  useUpdateAiAgentPreference,
  type AiAgentPreference,
} from "@zilobase/features/ai-chat"
import { useActiveWorkspaceId } from "@zilobase/features/workspaces"
import {
  useZilobaseAiPages,
  usePages,
} from "@zilobase/features/pages"

import { ZilobaseAiSection } from "./zilobase-ai/components/zilobase-ai-section"
import { toast } from "sonner"

export default function ZilobaseAiSettingsPage() {
  const workspaceId = useActiveWorkspaceId()
  const { data: aiPages = [], isLoading } =
    useZilobaseAiPages(workspaceId)
  const { data: pages = [] } = usePages(workspaceId)
  const pagesById = React.useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  )
  const preferenceQuery = useAiAgentPreference()
  const updatePreference = useUpdateAiAgentPreference()
  const [instructions, setInstructions] = React.useState("")
  const [responseStyle, setResponseStyle] = React.useState<
    AiAgentPreference["responseStyle"]
  >("concise")

  React.useEffect(() => {
    if (!preferenceQuery.data) return
    setInstructions(preferenceQuery.data.instructions)
    setResponseStyle(preferenceQuery.data.responseStyle)
  }, [preferenceQuery.data])

  const savePreference = React.useCallback(async () => {
    try {
      await updatePreference.mutateAsync({ instructions, responseStyle })
      toast.success("AI preferences saved.")
    } catch (error) {
      toast.error("Could not save AI preferences", {
        description: error instanceof Error ? error.message : "Try again.",
      })
    }
  }, [instructions, responseStyle, updatePreference])

  const instructionPages = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.zilobaseai === "instruction",
      ),
    [aiPages],
  )

  const skills = React.useMemo(
    () =>
      aiPages.filter(
        (page) => page.metadata.zilobaseai === "skill",
      ),
    [aiPages],
  )

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Zilobase AI"
        description="Manage pages used as AI instructions and skills."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <section className="grid gap-4">
          <div className="space-y-1">
            <h3 className="font-heading text-base leading-snug font-medium">
              Personal instructions
            </h3>
            <p className="text-sm text-muted-foreground">
              Applied to every new response in this workspace. Instructions
              cannot grant permissions or enable unavailable tools.
            </p>
          </div>
          <Textarea
            aria-label="Personal AI instructions"
            className="min-h-28 resize-y"
            disabled={preferenceQuery.isLoading}
            maxLength={4000}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="For example: Start with the decision, use short bullets, and call out assumptions."
            value={instructions}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Response style</span>
              <Select
                onValueChange={(value) =>
                  setResponseStyle(value as AiAgentPreference["responseStyle"])
                }
                value={responseStyle}
              >
                <SelectTrigger className="w-44" aria-label="AI response style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button
              disabled={preferenceQuery.isLoading || updatePreference.isPending}
              onClick={() => void savePreference()}
              type="button"
            >
              {updatePreference.isPending ? "Saving..." : "Save preferences"}
            </Button>
          </div>
        </section>
        <Separator />
        <ZilobaseAiSection
          isLoading={isLoading}
          items={instructionPages}
          mode="instruction"
          workspaceId={workspaceId ?? null}
          pagesById={pagesById}
        />
        <Separator />
        <ZilobaseAiSection
          isLoading={isLoading}
          items={skills}
          mode="skill"
          workspaceId={workspaceId ?? null}
          pagesById={pagesById}
        />
      </div>
    </main>
  )
}
