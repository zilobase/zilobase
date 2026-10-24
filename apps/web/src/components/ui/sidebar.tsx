import * as React from "react";
import { Slot } from "radix-ui";

import { SidebarSimpleIcon } from "@/components/icons";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button, buttonControlHeightClassName } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const APP_SIDEBAR_PANEL_WIDTH = "288px";
const DEFAULT_SIDEBAR_WIDTH = APP_SIDEBAR_PANEL_WIDTH;
const DEFAULT_MOBILE_SIDEBAR_WIDTH = "18rem";

type SidebarOpenSetter = (value: boolean | ((current: boolean) => boolean)) => void;

type SidebarContextValue = {
  triggerRef: React.RefObject<HTMLElement | null>;
  isMobile: boolean;
  mobileWidth: React.CSSProperties["width"];
  open: boolean;
  preferredOpen: boolean;
  setOpen: SidebarOpenSetter;
  setAutoCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useOptionalSidebar() {
  return React.useContext(SidebarContext);
}

function useSidebar() {
  const context = useOptionalSidebar();

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const isMobile = useIsMobile();
  const mobileWidth =
    (style as Record<string, string> | undefined)?.["--sidebar-width-mobile"] ??
    DEFAULT_MOBILE_SIDEBAR_WIDTH;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const preferredOpen = controlledOpen ?? uncontrolledOpen;
  const [autoCollapsed, setAutoCollapsed] = React.useState(false);
  const open = preferredOpen && !autoCollapsed;

  const setOpen = React.useCallback<SidebarOpenSetter>(
    (value) => {
      const nextOpen = typeof value === "function" ? value(open) : value;
      setAutoCollapsed(false);

      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange, open],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }

    setOpen((current) => !current);
  }, [isMobile, setOpen]);

  const contextValue = React.useMemo<SidebarContextValue>(
    () => ({
      triggerRef,
      isMobile,
      mobileWidth,
      open,
      preferredOpen,
      setOpen,
      setAutoCollapsed,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [isMobile, mobileWidth, open, preferredOpen, openMobile, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": DEFAULT_SIDEBAR_WIDTH,
            "--sidebar-width-mobile": mobileWidth,
            ...style,
          } as React.CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

// Adapted from shadcn sidebar-07: the app uses offcanvas collapse and its own tokens.
function Sidebar({
  className,
  children,
  style,
  collapsible = "offcanvas",
  ...props
}: React.ComponentProps<"div"> & { collapsible?: "offcanvas" }) {
  const { isMobile, mobileWidth, open, openMobile, setOpenMobile, triggerRef } = useSidebar();
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          className={cn(
            "data-[side=left]:w-(--sidebar-width) bg-surface-navigation p-0 text-content-primary [&>button]:hidden",
            className,
          )}
          onCloseAutoFocus={(event) => {
            if (triggerRef.current?.isConnected) {
              event.preventDefault();
              triggerRef.current.focus();
            }
          }}
          side="left"
          style={{ "--sidebar-width": mobileWidth, ...style } as React.CSSProperties}
          {...props}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <div
      className="group peer hidden text-content-primary md:block"
      data-state={open ? "expanded" : "collapsed"}
      data-collapsible={open ? "" : collapsible}
      data-variant="sidebar"
      data-side="left"
      data-slot="sidebar"
    >
      <div
        aria-hidden="true"
        data-slot="sidebar-gap"
        className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0"
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 left-0 z-10 hidden h-svh w-(--sidebar-width) border-r border-stroke-default transition-[left] duration-200 ease-linear group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] md:flex",
          className,
        )}
        style={style}
        inert={!open}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col overflow-hidden bg-surface-navigation"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, triggerRef } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        triggerRef.current = event.currentTarget;
        toggleSidebar();
      }}
      {...props}
    >
      <SidebarSimpleIcon className="size-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative flex w-full flex-1 flex-col bg-surface-canvas", className)}
      {...props}
    />
  );
}

function SidebarHeader({
  actions,
  navigation,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  actions?: React.ReactNode;
  navigation?: React.ReactNode;
}) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-0.5 p-2 pb-0", className)}
      {...props}
    >
      <div className="flex h-8 items-center">
        <div className="flex h-full min-w-0 flex-1 items-center">{children}</div>
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
      {navigation ? <div className="-mx-2">{navigation}</div> : null}
    </div>
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-0.5 p-2", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto pt-0.5 pb-1",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col px-2 py-0", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        buttonControlHeightClassName,
        "flex shrink-0 items-center rounded-md px-2 text-xs font-medium text-content-secondary ring-action-focus-ring outline-hidden hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "absolute top-1/2 right-3 flex aspect-square w-5 -translate-y-1/2 items-center justify-center rounded-md p-0 text-content-primary ring-action-focus-ring outline-hidden transition-transform after:absolute after:-inset-2 hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 active:bg-action-neutral-pressed active:text-action-on-neutral md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-active={isActive}
      className={cn(
        buttonControlHeightClassName,
        "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm font-medium text-content-secondary ring-action-focus-ring outline-hidden group-has-data-[sidebar=menu-action]/menu-item:pr-8 hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 active:bg-action-neutral-pressed active:text-action-on-neutral disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-action-neutral-hover data-open:hover:text-action-on-neutral data-active:bg-action-neutral-hover data-active:text-action-on-neutral data-active:hover:bg-action-neutral-pressed data-active:hover:text-action-on-neutral data-active:group-hover/nav-row:bg-action-neutral-pressed data-active:group-hover/nav-row:text-action-on-neutral data-active:active:bg-action-neutral-pressed data-active:active:text-action-on-neutral [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "absolute top-1/2 right-1 flex aspect-square w-5 -translate-y-1/2 items-center justify-center rounded-md p-0 text-content-primary ring-action-focus-ring outline-hidden transition-transform after:absolute after:-inset-2 peer-hover/menu-button:text-action-on-neutral hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 active:bg-action-neutral-pressed active:text-action-on-neutral md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
        showOnHover &&
          "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-action-on-neutral peer-data-active/menu-button:peer-hover/menu-button:text-action-on-neutral aria-expanded:opacity-100 md:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  useOptionalSidebar,
};

const SIDEBAR_NAV_ACTION_EDGE_INSET = 6;

export const SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME =
  "group-hover/nav-row:bg-action-neutral-hover group-hover/nav-row:text-action-on-neutral group-hover/nav-row:data-active:bg-action-neutral-pressed group-hover/nav-row:data-active:text-action-on-neutral group-active/nav-row:bg-action-neutral-pressed group-active/nav-row:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:bg-action-neutral-hover group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:data-active:bg-action-neutral-pressed group-has-[>[data-nav-menu-action=menu][aria-expanded=true]]/nav-row:data-active:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:bg-action-neutral-hover group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:text-action-on-neutral group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:data-active:bg-action-neutral-pressed group-has-[>[data-nav-menu-action=menu][data-state=open]]/nav-row:data-active:text-action-on-neutral";

type SidebarNavItemActionProps = React.ComponentProps<typeof SidebarMenuAction> & {
  depth?: number;
  position?: "start" | "end";
  variant: "disclosure" | "menu";
};

export function SidebarNavItemAction({
  className,
  depth = 0,
  position = "end",
  style,
  variant,
  ...props
}: SidebarNavItemActionProps) {
  const edgeOffset = SIDEBAR_NAV_ACTION_EDGE_INSET + (position === "start" ? depth * 16 : 0);
  const positionStyle: React.CSSProperties =
    position === "start"
      ? { left: `${edgeOffset}px`, right: "auto" }
      : { right: `${edgeOffset}px` };

  return (
    <SidebarMenuAction
      className={cn(
        "rounded-md opacity-0 text-content-secondary! group-hover/nav-row:opacity-100 hover:bg-action-neutral-hover active:bg-action-neutral-pressed! focus-visible:bg-action-neutral-hover focus-visible:opacity-100",
        variant === "disclosure" && "data-[state=open]:rotate-90 [&>svg]:size-3",
        variant === "menu" &&
          "aria-expanded:bg-action-neutral-hover aria-expanded:opacity-100 aria-expanded:text-content-secondary data-[state=open]:bg-action-neutral-hover data-[state=open]:opacity-100 data-[state=open]:text-content-secondary",
        className,
      )}
      data-nav-menu-action={variant}
      style={{ ...positionStyle, ...style }}
      {...props}
    />
  );
}
