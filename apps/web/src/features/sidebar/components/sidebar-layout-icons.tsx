import {
  BotIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  CircleDashedIcon,
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  Layers3Icon,
  ListIcon,
  ListChecksIcon,
  LockIcon,
  MailIcon,
  MailPlusIcon,
  InboxIcon,
  MailCheckIcon,
  ArchiveIcon,
  BanIcon,
  FilePenLineIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "@/shared/components/icons"

import type { LibraryView, MailView, SidebarShortcut, SidebarTabIconId } from "@zilobase/features/user-settings"
import { PageIconDisplay } from "@/features/pages/index"

export const libraryViewIcons = {
  favourites: StarIcon,
  meetings: CalendarDaysIcon,
  private: LockIcon,
  recents: HistoryIcon,
  shared: UsersIcon,
  teamspaces: Layers3Icon,
} satisfies Record<LibraryView, typeof HistoryIcon>

const sidebarTabIcons = {
  briefcase: BriefcaseIcon,
  calendar: CalendarDaysIcon,
  circle: CircleDashedIcon,
  database: DatabaseIcon,
  folder: FolderIcon,
  home: HomeIcon,
  list: ListIcon,
  mail: MailIcon,
  sparkles: SparklesIcon,
  star: StarIcon,
} satisfies Record<SidebarTabIconId, typeof HomeIcon>

export const mailViewIcons = {
  archive: ArchiveIcon,
  drafts: FilePenLineIcon,
  inbox: InboxIcon,
  sent: SendIcon,
  spam: BanIcon,
  starred: StarIcon,
  trash: Trash2Icon,
  unread: MailCheckIcon,
} satisfies Record<MailView, typeof MailIcon>

export function SidebarTabIcon({ value }: { value: string }) {
  const Icon = sidebarTabIcons[value as SidebarTabIconId]
  return Icon ? (
    <Icon aria-hidden="true" className="size-4" />
  ) : (
    <PageIconDisplay className="pointer-events-none" size="sm" value={value} />
  )
}

export function SidebarShortcutIcon({ shortcut }: { shortcut: SidebarShortcut }) {
  if (shortcut.icon) return <SidebarTabIcon value={shortcut.icon} />

  const Icon = getDefaultShortcutIcon(shortcut.target)
  return <Icon aria-hidden="true" className="size-4" />
}

function getDefaultShortcutIcon(target: SidebarShortcut["target"]) {
  if (target.type === "action") {
    return target.action === "composeMail"
      ? MailPlusIcon
      : target.action === "createPage"
      ? FileIcon
      : target.action === "createDatabase"
        ? DatabaseIcon
        : BotIcon
  }
  if (target.type === "page") return FileIcon
  if (target.type === "database") return DatabaseIcon
  if (target.type === "library") return libraryViewIcons[target.view]
  if (target.type === "mail") return mailViewIcons[target.view]
  return {
    ai: SparklesIcon,
    meetings: CalendarDaysIcon,
    settings: SettingsIcon,
    tasks: ListChecksIcon,
    trash: Trash2Icon,
  }[target.route]
}
