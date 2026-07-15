"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from "lucide-react"

type DropdownMenuSubDisplayMode = "inline" | "nested"

type InlineSubmenuPanel = {
  children: React.ReactNode
  className?: string
  id: string
  title: string
}

type InlineSubmenuNavigationContextValue = {
  getActivePanel: () => InlineSubmenuPanel | null
  goBack: () => void
  navigateTo: (id: string) => void
  registerPanel: (panel: InlineSubmenuPanel) => void
  reset: () => void
  subscribe: (listener: () => void) => () => void
}

const InlineSubmenuNavigationContext =
  React.createContext<InlineSubmenuNavigationContextValue | null>(null)
const InlineSubmenuRegistrationContext = React.createContext(false)
const InlineSubmenuPanelContext = React.createContext(false)

const getNoActivePanel = () => null
const subscribeNoop = () => () => {}

function createInlineSubmenuNavigationStore(): InlineSubmenuNavigationContextValue {
  const panels = new Map<string, InlineSubmenuPanel>()
  const listeners = new Set<() => void>()
  let navigationStack: string[] = []

  const notify = () => {
    listeners.forEach((listener) => listener())
  }

  return {
    getActivePanel: () => {
      const activePanelId = navigationStack.at(-1)
      return activePanelId ? (panels.get(activePanelId) ?? null) : null
    },
    goBack: () => {
      if (navigationStack.length === 0) return
      navigationStack = navigationStack.slice(0, -1)
      notify()
    },
    navigateTo: (id) => {
      if (!panels.has(id) || navigationStack.at(-1) === id) return
      navigationStack = [...navigationStack, id]
      notify()
    },
    registerPanel: (panel) => {
      const currentPanel = panels.get(panel.id)

      if (
        currentPanel &&
        currentPanel.children === panel.children &&
        currentPanel.className === panel.className &&
        currentPanel.title === panel.title
      ) {
        return
      }

      panels.set(panel.id, panel)
      if (navigationStack.at(-1) === panel.id) notify()
    },
    reset: () => {
      if (navigationStack.length === 0) return
      navigationStack = []
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

type DropdownMenuSubContextValue = {
  displayMode: DropdownMenuSubDisplayMode
  id: string
  title: string
}

const DropdownMenuSubContext =
  React.createContext<DropdownMenuSubContextValue | null>(null)

function DropdownMenu({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [inlineNavigation] = React.useState(createInlineSubmenuNavigationStore)

  React.useEffect(() => {
    if (props.open === false) inlineNavigation.reset()
  }, [inlineNavigation, props.open])

  return (
    <InlineSubmenuNavigationContext.Provider value={inlineNavigation}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        onOpenChange={(open) => {
          if (!open) inlineNavigation.reset()
          onOpenChange?.(open)
        }}
        {...props}
      />
    </InlineSubmenuNavigationContext.Provider>
  )
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  const inlineNavigation = React.useContext(InlineSubmenuNavigationContext)
  const activePanel = React.useSyncExternalStore(
    inlineNavigation?.subscribe ?? subscribeNoop,
    inlineNavigation?.getActivePanel ?? getNoActivePanel,
    inlineNavigation?.getActivePanel ?? getNoActivePanel
  )

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
          activePanel && "w-max"
        )}
        {...props}
      >
        <>
          <InlineSubmenuRegistrationContext.Provider
            value={Boolean(activePanel)}
          >
            <div
              aria-hidden={activePanel ? true : undefined}
              className={cn(!activePanel && "contents")}
              hidden={Boolean(activePanel)}
              inert={activePanel ? true : undefined}
            >
              {props.children}
            </div>
          </InlineSubmenuRegistrationContext.Provider>
          {activePanel ? (
            <>
              <div className="flex items-center gap-1 px-1 py-1.5">
                <Button
                  aria-label={`Back from ${activePanel.title}`}
                  className="text-muted-foreground"
                  onClick={inlineNavigation?.goBack}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <div className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-foreground">
                  {activePanel.title}
                </div>
                <DropdownMenuPrimitive.Item asChild>
                  <Button
                    aria-label={`Close ${activePanel.title}`}
                    className="text-muted-foreground"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </DropdownMenuPrimitive.Item>
              </div>
              <div
                className={activePanel.className}
                data-slot="dropdown-menu-inline-sub-content"
              >
                <InlineSubmenuPanelContext.Provider value>
                  {activePanel.children}
                </InlineSubmenuPanelContext.Provider>
              </div>
            </>
          ) : null}
        </>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  closeOnSelect,
  inset,
  onSelect,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  closeOnSelect?: boolean
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  const isInlineSubmenuPanel = React.useContext(InlineSubmenuPanelContext)
  const shouldCloseOnSelect = closeOnSelect ?? !isInlineSubmenuPanel

  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-hidden select-none focus:bg-accent data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
      onSelect={(event) => {
        onSelect?.(event)

        if (!shouldCloseOnSelect) event.preventDefault()
      }}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  children,
  displayMode = "nested",
  title = "Submenu",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub> & {
  displayMode?: DropdownMenuSubDisplayMode
  title?: string
}) {
  const id = React.useId()
  const contextValue = React.useMemo(
    () => ({ displayMode, id, title }),
    [displayMode, id, title]
  )

  if (displayMode === "inline") {
    return (
      <DropdownMenuSubContext.Provider value={contextValue}>
        {children}
      </DropdownMenuSubContext.Provider>
    )
  }

  return (
    <DropdownMenuSubContext.Provider value={contextValue}>
      <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props}>
        {children}
      </DropdownMenuPrimitive.Sub>
    </DropdownMenuSubContext.Provider>
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  const submenu = React.useContext(DropdownMenuSubContext)
  const inlineNavigation = React.useContext(InlineSubmenuNavigationContext)
  const registrationOnly = React.useContext(InlineSubmenuRegistrationContext)
  const triggerClassName = cn(
    "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent data-inset:pl-7 data-open:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className
  )

  if (submenu?.displayMode === "inline") {
    if (registrationOnly) return null

    return (
      <DropdownMenuPrimitive.Item
        data-slot="dropdown-menu-sub-trigger"
        data-inset={inset}
        className={triggerClassName}
        disabled={props.disabled}
        onSelect={(event) => {
          event.preventDefault()
          inlineNavigation?.navigateTo(submenu.id)
        }}
        textValue={props.textValue}
      >
        {children}
        <ChevronRightIcon className="ml-auto" />
      </DropdownMenuPrimitive.Item>
    )
  }

  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={triggerClassName}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  const submenu = React.useContext(DropdownMenuSubContext)
  const inlineNavigation = React.useContext(InlineSubmenuNavigationContext)
  const registerPanel = inlineNavigation?.registerPanel
  const panel = React.useMemo(
    () =>
      submenu
        ? {
            children,
            className,
            id: submenu.id,
            title: submenu.title,
          }
        : null,
    [children, className, submenu]
  )

  React.useEffect(() => {
    if (submenu?.displayMode !== "inline" || !panel || !registerPanel) return
    registerPanel(panel)
  }, [panel, registerPanel, submenu?.displayMode])

  if (submenu?.displayMode === "inline") return null

  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.SubContent>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  type DropdownMenuSubDisplayMode,
}
