import type { ComponentProps, CSSProperties } from "react"

import { SidebarMenuAction } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const SIDEBAR_NAV_ACTION_EDGE_INSET = 6

export const SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME =
  "group-hover/nav-row:bg-accent group-hover/nav-row:text-accent-foreground group-hover/nav-row:data-active:bg-active group-hover/nav-row:data-active:text-active-foreground group-active/nav-row:bg-active group-active/nav-row:text-active-foreground group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:bg-accent group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:text-accent-foreground group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:data-active:bg-active group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:data-active:text-active-foreground group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:bg-accent group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:text-accent-foreground group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:data-active:bg-active group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:data-active:text-active-foreground"

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
        "rounded-md opacity-0 text-muted-foreground group-hover/nav-row:opacity-100 group-hover/nav-row:text-accent-foreground hover:bg-sidebar-control-hover hover:text-muted-foreground focus-visible:bg-sidebar-control-hover focus-visible:opacity-100 focus-visible:text-muted-foreground",
        variant === "disclosure" && "data-[state=open]:rotate-90",
        variant === "menu" &&
          "aria-expanded:bg-sidebar-control-hover aria-expanded:opacity-100 aria-expanded:text-muted-foreground data-[state=open]:bg-sidebar-control-hover data-[state=open]:opacity-100 data-[state=open]:text-muted-foreground",
        className,
      )}
      data-nav-menu-action={variant}
      style={{ ...positionStyle, ...style }}
      {...props}
    />
  )
}
