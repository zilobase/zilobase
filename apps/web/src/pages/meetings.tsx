import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { CalendarDays, LoaderCircle } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageIconDisplay } from "@/lib/page-icon"
import { useActiveWorkspaceId } from "@zilobase/features/integrations"
import {
  useWorkspaceMeetings,
  type MeetingListItem,
  type MeetingStatus,
} from "@zilobase/features/meetings"

const meetingViews = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
] as const

type MeetingViewId = (typeof meetingViews)[number]["id"]

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

export default function MeetingsPage() {
  const workspaceId = useActiveWorkspaceId()
  const { data, isLoading } = useWorkspaceMeetings(workspaceId)
  const [activeViewId, setActiveViewId] = useState<MeetingViewId>("all")
  const meetings = useMemo(
    () =>
      (data?.meetings ?? []).filter((meeting) =>
        matchesMeetingView(meeting.status, activeViewId),
      ),
    [activeViewId, data?.meetings],
  )

  return (
    <main className="min-h-0 flex-1 bg-background">
      <section className="animate-in fade-in-0 px-5 pb-10 pt-12 duration-300 sm:px-8 md:px-20 lg:px-24">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-5 flex items-center gap-3">
            <CalendarDays className="size-8 text-muted-foreground" />
            <h1 className="text-3xl font-semibold tracking-tight">Meetings</h1>
          </div>

          <Tabs
            onValueChange={(value) => setActiveViewId(value as MeetingViewId)}
            value={activeViewId}
          >
            <TabsList className="mb-3" variant="tab">
              {meetingViews.map((view) => (
                <TabsTrigger key={view.id} value={view.id}>
                  {view.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="overflow-hidden rounded-lg border">
            {isLoading ? (
              <div className="flex min-h-40 items-center justify-center">
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : meetings.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center px-6 text-sm text-muted-foreground">
                No meetings in this view.
              </div>
            ) : (
              <MeetingTable meetings={meetings} />
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function MeetingTable({ meetings }: { meetings: MeetingListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Meeting name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Language</TableHead>
          <TableHead>Last edited</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meetings.map((meeting) => (
          <TableRow key={meeting.id}>
            <TableCell className="min-w-64 font-medium">
              <Link
                className="flex items-center gap-2 hover:underline"
                params={{ meetingId: meeting.id }}
                to="/m/$meetingId"
              >
                <PageIconDisplay size="sm" value={meeting.emoji || "📅"} />
                <span className="truncate">
                  {meeting.title.trim() || "Meeting"}
                </span>
              </Link>
            </TableCell>
            <TableCell>{formatMeetingStatus(meeting.status)}</TableCell>
            <TableCell>{formatMeetingLanguage(meeting.language)}</TableCell>
            <TableCell>{formatMeetingDate(meeting.updatedAt)}</TableCell>
            <TableCell>{formatMeetingDate(meeting.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function matchesMeetingView(status: MeetingStatus, viewId: MeetingViewId) {
  if (viewId === "ready") return status === "idle"
  if (viewId === "active") {
    return (
      status === "recording" ||
      status === "paused" ||
      status === "processing"
    )
  }
  if (viewId === "completed") {
    return status === "completed" || status === "failed"
  }
  return true
}

function formatMeetingStatus(status: MeetingStatus) {
  if (status === "idle") return "Ready"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatMeetingLanguage(language: string) {
  const labels: Record<string, string> = {
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    hi: "Hindi",
  }
  return labels[language] ?? language
}

function formatMeetingDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date)
}
