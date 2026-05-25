"use client"

import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { NavFavorites } from "@/components/nav-favorites"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavWorkspaces } from "@/components/nav-workspaces"
import { OrganizationSwitcher } from "@/components/organization-switcher"
import { ThemeDropdown } from "@/components/theme-dropdown"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useSession } from "@/features/auth/hooks"
import { useOrganizations } from "@/features/organizations/hooks"
import {
  getWorkspaceEmoji,
} from "@/features/workspaces/queries"
import {
  useCreateWorkspace,
  useWorkspaces,
} from "@/features/workspaces/hooks"
import { useAppStore } from "@/stores/app-store"
import { SearchIcon, SparklesIcon, HomeIcon, InboxIcon, CalendarIcon, Settings2Icon, BlocksIcon, Trash2Icon, MessageCircleQuestionIcon } from "lucide-react"

// This is sample data.
const data = {
  navMain: [
    {
      title: "Search",
      url: "#",
      icon: (
        <SearchIcon
        />
      ),
    },
    {
      title: "Ask AI",
      url: "#",
      icon: (
        <SparklesIcon
        />
      ),
    },
    {
      title: "Home",
      url: "#",
      icon: (
        <HomeIcon
        />
      ),
      isActive: true,
    },
    {
      title: "Inbox",
      url: "#",
      icon: (
        <InboxIcon
        />
      ),
      badge: "10",
    },
  ],
  navSecondary: [
    {
      title: "Calendar",
      url: "#",
      icon: (
        <CalendarIcon
        />
      ),
    },
    {
      title: "Settings",
      url: "/settings/profile",
      icon: (
        <Settings2Icon
        />
      ),
    },
    {
      title: "Templates",
      url: "#",
      icon: (
        <BlocksIcon
        />
      ),
    },
    {
      title: "Trash",
      url: "#",
      icon: (
        <Trash2Icon
        />
      ),
    },
    {
      title: "Help",
      url: "#",
      icon: (
        <MessageCircleQuestionIcon
        />
      ),
    },
  ],
  favorites: [
    {
      name: "Project Management & Task Tracking",
      url: "#",
      emoji: "📊",
    },
    {
      name: "Family Recipe Collection & Meal Planning",
      url: "#",
      emoji: "🍳",
    },
    {
      name: "Fitness Tracker & Workout Routines",
      url: "#",
      emoji: "💪",
    },
    {
      name: "Book Notes & Reading List",
      url: "#",
      emoji: "📚",
    },
    {
      name: "Sustainable Gardening Tips & Plant Care",
      url: "#",
      emoji: "🌱",
    },
    {
      name: "Language Learning Progress & Resources",
      url: "#",
      emoji: "🗣️",
    },
    {
      name: "Home Renovation Ideas & Budget Tracker",
      url: "#",
      emoji: "🏠",
    },
    {
      name: "Personal Finance & Investment Portfolio",
      url: "#",
      emoji: "💰",
    },
    {
      name: "Movie & TV Show Watchlist with Reviews",
      url: "#",
      emoji: "🎬",
    },
    {
      name: "Daily Habit Tracker & Goal Setting",
      url: "#",
      emoji: "✅",
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const activeOrganizationId = useAppStore((state) => state.activeOrganizationId)
  const { data: session } = useSession()
  const { data: organizations = [] } = useOrganizations()
  const organizationId =
    activeOrganizationId ??
    session?.session?.activeOrganizationId ??
    organizations[0]?.id ??
    null
  const { data: workspaceRecords = [] } = useWorkspaces(organizationId)
  const createWorkspace = useCreateWorkspace()
  const workspaces = workspaceRecords.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    emoji: getWorkspaceEmoji(workspace),
    pages: [],
  }))

  const handleCreateWorkspace = async () => {
    if (!organizationId || createWorkspace.isPending) {
      return
    }

    const workspace = await createWorkspace.mutateAsync({ organizationId })

    await navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: workspace.id },
    })
  }

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <OrganizationSwitcher />
        <NavMain items={data.navMain} />
      </SidebarHeader>
      <SidebarContent>
        <NavFavorites favorites={data.favorites} />
        <NavWorkspaces
          onCreateWorkspace={handleCreateWorkspace}
          workspaces={workspaces}
        />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <ThemeDropdown />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
