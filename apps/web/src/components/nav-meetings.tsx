import { Link } from "@tanstack/react-router"
import { CalendarDays } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { PageIconDisplay } from "@/lib/page-icon"
import { scrollToMeetingBlock } from "@/lib/meeting-navigation"
import type { MeetingListItem } from "@zilobase/features/meetings"

export function NavMeetings({
  activeMeetingId,
  meetings,
}: {
  activeMeetingId: string | null
  meetings: MeetingListItem[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Meetings</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {meetings.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-sidebar-foreground/55">
              Meeting blocks on pages appear here.
            </p>
          ) : (
            meetings.map((meeting) => (
              <SidebarMenuItem key={meeting.id}>
                <SidebarMenuButton
                  asChild
                  isActive={meeting.id === activeMeetingId}
                >
                  <Link
                    params={{ pageId: meeting.pageId }}
                    onClick={() => {
                      scrollToMeetingBlock(document, meeting.id)
                    }}
                    search={{ meeting: meeting.id }}
                    to="/p/$pageId"
                  >
                    {meeting.emoji ? (
                      <PageIconDisplay size="sm" value={meeting.emoji} />
                    ) : (
                      <CalendarDays />
                    )}
                    <span>{meeting.title.trim() || "Meeting"}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
