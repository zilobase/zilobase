import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "@tanstack/react-router"
import type {
  MailConnection,
  MailLabelRecord,
  MailPersistedView,
  MailSystemFolderId,
  MailViewsBootstrap,
} from "@zilobase/features/mail"
import { mailSystemFolderIds } from "@zilobase/features/mail"
import * as React from "react"
import { toast } from "sonner"

import { apiFetch, getApiErrorMessage } from "@/features/desktop/network/api"
import { mailApiBasePath } from "@/features/mail/model/mail-api-path"
import { useMailViews } from "@/features/mail/model/use-mail-views"
import {
  BanIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilePenLineIcon,
  InboxIcon,
  MailIcon,
  PlusIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
} from "@/shared/components/icons"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"

const systemFolderDetails: Record<MailSystemFolderId, {
  gmailLabelId: string | null
  icon: typeof MailIcon
  label: string
}> = {
  all_mail: { gmailLabelId: null, icon: MailIcon, label: "All Mail" },
  sent: { gmailLabelId: "SENT", icon: SendIcon, label: "Sent" },
  drafts: { gmailLabelId: "DRAFT", icon: FilePenLineIcon, label: "Drafts" },
  spam: { gmailLabelId: "SPAM", icon: BanIcon, label: "Spam" },
  bin: { gmailLabelId: "TRASH", icon: Trash2Icon, label: "Bin" },
}

export function WorkspaceMailNavigation({ workspaceId }: {
  workspaceId: string | null | undefined
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = React.useState(true)
  const mailBasePath = mailApiBasePath(workspaceId)
  const connectionQuery = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: ({ signal }) => apiFetch<MailConnection>(`${mailBasePath}/connection`, { signal }),
    queryKey: ["mail", "connection", workspaceId],
    staleTime: 15_000,
  })
  const connection = connectionQuery.data
  const viewsQuery = useMailViews({
    bindingId: connection?.bindingId,
    enabled: connection?.status === "connected",
    workspaceId,
  })
  const labelsQuery = useQuery({
    enabled: connection?.status === "connected",
    queryFn: ({ signal }) => apiFetch<{ labels: MailLabelRecord[] }>(`${mailBasePath}/labels`, { signal }),
    queryKey: ["mail", "labels", workspaceId, connection?.bindingId],
    staleTime: 30_000,
  })
  const views = viewsQuery.data?.views ?? []
  const requestedView = typeof location.search.view === "string"
    ? location.search.view
    : "inbox"
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 4 },
  }))
  const queryKey = ["mail", "views", workspaceId, connection?.bindingId]

  const createView = useMutation({
    mutationFn: () => apiFetch<{ view: MailPersistedView }>(`${mailBasePath}/views`, {
      body: JSON.stringify({ name: "New view" }),
      method: "POST",
    }),
    onError: (error) => toast.error(getApiErrorMessage(error)),
    onSuccess: async ({ view }) => {
      await queryClient.invalidateQueries({ queryKey })
      await navigate({ search: { view: view.id }, to: "/mail" })
    },
  })
  const reorderViews = useMutation({
    mutationFn: (viewIds: string[]) => apiFetch<{ views: MailPersistedView[] }>(
      `${mailBasePath}/views/reorder`,
      { body: JSON.stringify({ viewIds }), method: "PUT" },
    ),
    onError: (error) => {
      toast.error(getApiErrorMessage(error))
      void queryClient.invalidateQueries({ queryKey })
    },
    onSuccess: ({ views: reordered }) => {
      queryClient.setQueryData<MailViewsBootstrap>(queryKey, (current) => current
        ? { ...current, views: reordered }
        : current)
    },
  })

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || reorderViews.isPending) return
    const from = views.findIndex((view) => view.id === active.id)
    const to = views.findIndex((view) => view.id === over.id)
    if (from < 0 || to < 0) return
    const reordered = arrayMove(views, from, to)
    queryClient.setQueryData<MailViewsBootstrap>(queryKey, (current) => current
      ? { ...current, views: reordered }
      : current)
    reorderViews.mutate(reordered.map((view) => view.id))
  }
  const labelCounts = new Map(
    (labelsQuery.data?.labels ?? []).map((label) => [label.id, label]),
  )
  const visibleViews = expanded
    ? views
    : views.filter((view) => view.protected)

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Views</SidebarGroupLabel>
        <SidebarGroupContent>
          <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd} sensors={sensors}>
            <SortableContext items={visibleViews.map((view) => view.id)} strategy={verticalListSortingStrategy}>
              <SidebarMenu aria-label="Mail views">
                {visibleViews.map((view) => (
                  <SortableViewRow
                    active={requestedView === view.id || (requestedView === "inbox" && view.protected)}
                    count={unreadCountForView(view, labelCounts)}
                    key={view.id}
                    onSelect={() => void navigate({ search: { view: view.id }, to: "/mail" })}
                    view={view}
                  />
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton disabled={createView.isPending || !connection?.bindingId} onClick={() => createView.mutate()} type="button">
                    <PlusIcon />
                    <span>Add view</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setExpanded((current) => !current)} type="button">
                    {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    <span>{expanded ? "Less" : "More"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SortableContext>
          </DndContext>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="pt-2">
        <SidebarGroupLabel>Mail</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu aria-label="System mail folders">
            {mailSystemFolderIds.map((folderId) => {
              const details = systemFolderDetails[folderId]
              const Icon = details.icon
              const label = details.gmailLabelId
                ? labelCounts.get(details.gmailLabelId)
                : null
              const count = folderId === "drafts"
                ? label?.threadsTotal ?? null
                : label?.threadsUnread ?? null
              return (
                <SidebarMenuItem key={folderId}>
                  <SidebarMenuButton isActive={requestedView === folderId} onClick={() => void navigate({ search: { view: folderId }, to: "/mail" })} type="button">
                    <Icon />
                    <span>{details.label}</span>
                    {count ? <span className="ml-auto text-xs tabular-nums text-content-secondary">{formatCount(count)}</span> : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}

function SortableViewRow({ active, count, onSelect, view }: {
  active: boolean
  count: number | null
  onSelect: () => void
  view: MailPersistedView
}) {
  const sortable = useSortable({ id: view.id })
  const Icon = view.templateId === "inbox"
    ? InboxIcon
    : view.templateId === "starred"
      ? StarIcon
      : MailIcon
  return (
    <SidebarMenuItem
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
    >
      <SidebarMenuButton
        {...sortable.attributes}
        {...sortable.listeners}
        isActive={active}
        onClick={onSelect}
        type="button"
      >
        <Icon />
        <span>{view.name}</span>
        {count ? <span className="ml-auto text-xs tabular-nums text-content-secondary">{formatCount(count)}</span> : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function unreadCountForView(
  view: MailPersistedView,
  labels: Map<string, MailLabelRecord>,
) {
  if (view.templateId === "inbox") return labels.get("INBOX")?.threadsUnread ?? null
  if (view.templateId === "unread") return labels.get("UNREAD")?.threadsTotal ?? null
  if (view.templateId === "starred") return labels.get("STARRED")?.threadsUnread ?? null
  return null
}

function formatCount(value: number) {
  return value > 99 ? "99+" : String(value)
}
