import { Link } from "@tanstack/react-router"
import { CalendarDays, ChevronRightIcon } from "@/shared/components/icons"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar"
import { PageIconDisplay } from "@/features/pages/index"
import type { MeetingListItem } from "@zilobase/features/meetings"

export function NavMeetings({
  activeMeetingId,
  meetings,
  storageKey,
}: {
  activeMeetingId: string | null
  meetings: MeetingListItem[]
  storageKey?: string
}) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey ?? "zilobase:sidebar-section:meetings")
  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel asChild className="hover:bg-action-neutral-hover hover:text-action-on-neutral">
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>Meetings</span>
              <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
        <SidebarMenu>
          {meetings.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-content-secondary">
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
                    params={{ meetingId: meeting.id }}
                    to="/m/$meetingId"
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
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
