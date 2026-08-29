import { useCallback } from "react"
import { useCreateMeeting } from "@zilobase/features/meetings"

export function useEditorMeetingActions(
  workspaceId?: string | null,
  pageId?: string | null,
) {
  const createMeeting = useCreateMeeting()

  const createEditorMeeting = useCallback(async () => {
    if (!workspaceId || !pageId) return null
    const payload = await createMeeting.mutateAsync({
      pageId,
      title: "Meeting",
      workspaceId,
    })
    return payload.meeting.id
  }, [createMeeting, pageId, workspaceId])

  return { createEditorMeeting }
}
