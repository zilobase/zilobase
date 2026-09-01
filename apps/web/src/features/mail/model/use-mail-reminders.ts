import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MailReminder } from "@zilobase/features/mail"

import { apiFetch } from "@/features/desktop/network/api"
import { mailApiBasePath } from "./mail-api-path"

export function useMailReminders(input: { bindingId: string | null | undefined; enabled: boolean; workspaceId: string | null | undefined }) {
  const queryClient = useQueryClient()
  const basePath = mailApiBasePath(input.workspaceId)
  const queryKey = ["mail", "reminders", input.workspaceId, input.bindingId] as const
  const query = useQuery({
    enabled: input.enabled && Boolean(input.bindingId && input.workspaceId),
    queryFn: ({ signal }) => apiFetch<{ reminders: MailReminder[] }>(`${basePath}/reminders`, { signal }),
    queryKey,
  })
  const refreshMail = () => {
    void queryClient.invalidateQueries({ queryKey: ["mail", "indexed-query", input.workspaceId, input.bindingId] })
    void queryClient.invalidateQueries({ queryKey: ["mail", "groups", input.workspaceId, input.bindingId] })
  }
  const schedule = useMutation({
    mutationFn: ({ remindAt, threadId }: { remindAt: string; threadId: string }) => apiFetch<{ reminder: MailReminder }>(`${basePath}/threads/${encodeURIComponent(threadId)}/remind`, { body: JSON.stringify({ remindAt }), method: "POST" }),
    onSuccess: ({ reminder }) => {
      queryClient.setQueryData<{ reminders: MailReminder[] }>(queryKey, (current) => ({ reminders: [...current?.reminders.filter((item) => item.threadId !== reminder.threadId) ?? [], reminder] }))
      refreshMail()
    },
  })
  const cancel = useMutation({
    mutationFn: (reminderId: string) => apiFetch<{ success: true }>(`${basePath}/reminders/${encodeURIComponent(reminderId)}`, { method: "DELETE" }).then(() => reminderId),
    onSuccess: (reminderId) => queryClient.setQueryData<{ reminders: MailReminder[] }>(queryKey, (current) => ({ reminders: current?.reminders.filter((item) => item.id !== reminderId) ?? [] })),
  })
  const advance = useMutation({
    mutationFn: () => apiFetch<{ fired: MailReminder[] }>(`${basePath}/reminders/advance`, { body: "{}", method: "POST" }),
    onSuccess: () => { void query.refetch(); refreshMail() },
  })
  const nextReminderAt = query.data?.reminders.reduce<number | null>((next, reminder) => {
    const value = new Date(reminder.remindAt).getTime()
    return next === null || value < next ? value : next
  }, null) ?? null
  useEffect(() => {
    if (nextReminderAt === null) return
    const timer = window.setTimeout(() => advance.mutate(), Math.max(0, Math.min(2_147_483_647, nextReminderAt - Date.now() + 250)))
    return () => window.clearTimeout(timer)
  }, [advance, nextReminderAt])
  return { ...query, cancel: cancel.mutateAsync, schedule: schedule.mutateAsync, working: schedule.isPending || cancel.isPending || advance.isPending }
}
