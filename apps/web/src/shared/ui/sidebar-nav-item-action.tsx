import type { ComponentProps, CSSProperties } from "react"

import { SidebarMenuAction } from "@/shared/ui/sidebar"
import { cn } from "@/shared/lib/utils"

const SIDEBAR_NAV_ACTION_EDGE_INSET = 6

export const SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME =
  "group-hover/nav-row:bg-action-neutral-hover group-hover/nav-row:text-action-on-neutral group-hover/nav-row:data-active:bg-action-neutral-pressed group-hover/nav-row:data-active:text-action-on-neutral group-active/nav-row:bg-action-neutral-pressed group-active/nav-row:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:bg-action-neutral-hover group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:data-active:bg-action-neutral-pressed group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:data-active:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:bg-action-neutral-hover group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:data-active:bg-action-neutral-pressed group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:data-active:text-action-on-neutral"

type SidebarNavItemActionProps = ComponentProps<typeof SidebarMenuAction> & {
  depth?: number
  position?: "start" | "end"
  variant: "disclosure" | "menu"
}

export function SidebarNavItemAction({
  className,
  depth = 0,
  position = "end",
  style,
  variant,
  ...props
}: SidebarNavItemActionProps) {
  const edgeOffset =
    SIDEBAR_NAV_ACTION_EDGE_INSET + (position === "start" ? depth * 16 : 0)
  const positionStyle: CSSProperties =
    position === "start"
      ? { left: `${edgeOffset}px`, right: "auto" }
      : { right: `${edgeOffset}px` }

  return (
    <SidebarMenuAction
      className={cn(
        "rounded-md opacity-0 text-content-secondary! group-hover/nav-row:opacity-100 hover:bg-action-neutral-hover active:bg-action-neutral-pressed! focus-visible:bg-action-neutral-hover focus-visible:opacity-100",
        variant === "disclosure" && "data-[state=open]:rotate-90",
        variant === "menu" &&
          "aria-expanded:bg-action-neutral-hover aria-expanded:opacity-100 aria-expanded:text-content-secondary data-[state=open]:bg-action-neutral-hover data-[state=open]:opacity-100 data-[state=open]:text-content-secondary",
        className,
      )}
      data-nav-menu-action={variant}
      style={{ ...positionStyle, ...style }}
      {...props}
    />
  )
}
