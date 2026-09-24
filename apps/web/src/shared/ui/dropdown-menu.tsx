"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import {
  menuSurfaceVariants,
  menuContentVariants,
  menuViewportClassName,
  menuItemVariants,
  menuLabelClassName,
  menuSeparatorClassName,
} from "@/shared/ui/menu-styles"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from "@/shared/components/icons"

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

  const notify = () => listeners.forEach((listener) => listener())

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

const DropdownMenuDefaultSubModeContext =
  React.createContext<DropdownMenuSubDisplayMode>("nested")

const DropdownMenuSubContext =
  React.createContext<DropdownMenuSubContextValue | null>(null)

function DropdownMenu({
  defaultSubDisplayMode = "nested",
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root> & {
  defaultSubDisplayMode?: DropdownMenuSubDisplayMode
}) {
  const [inlineNavigation] = React.useState(createInlineSubmenuNavigationStore)

  React.useEffect(() => {
    if (props.open === false) inlineNavigation.reset()
  }, [inlineNavigation, props.open])

  return (
    <DropdownMenuDefaultSubModeContext.Provider value={defaultSubDisplayMode}>
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
    </DropdownMenuDefaultSubModeContext.Provider>
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
  collisionPadding = 8,
  width = "default",
  padding = "menu",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  width?: "auto" | "sm" | "md" | "lg" | "default" | "xl" | "fit"
  padding?: "none" | "menu" | "roomy" | "spacious"
}) {
  const inlineNavigation = React.useContext(InlineSubmenuNavigationContext)
  const activePanel = React.useSyncExternalStore(
    inlineNavigation?.subscribe ?? subscribeNoop,
    inlineNavigation?.getActivePanel ?? getNoActivePanel,
    inlineNavigation?.getActivePanel ?? getNoActivePanel,
  )

  const backButtonRef = React.useRef<HTMLButtonElement>(null)
  const previousPanelId = React.useRef<string | null>(null)
  React.useEffect(() => {
    const previousId = previousPanelId.current
    previousPanelId.current = activePanel?.id ?? null
    if (activePanel) {
      backButtonRef.current?.focus()
    } else if (previousId) {
      document.getElementById(`${previousId}-trigger`)?.focus()
    }
  }, [activePanel?.id])

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          menuContentVariants({ padding, width }),
          menuSurfaceVariants(),
          menuViewportClassName,
          className,
          activePanel &&
            "flex w-max max-w-[min(20rem,calc(100vw-1rem))] flex-col overflow-hidden",
        )}
        {...props}
      >
        <InlineSubmenuRegistrationContext.Provider value={Boolean(activePanel)}>
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
            <div className="flex shrink-0 items-center gap-1 px-1 py-1">
              <Button
                ref={backButtonRef}
                aria-label={`Back from ${activePanel.title}`}
                className="text-content-secondary"
                onClick={inlineNavigation?.goBack}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeftIcon />
              </Button>
              <div className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-content-primary">
                {activePanel.title}
              </div>
              <DropdownMenuPrimitive.Item asChild>
                <Button
                  aria-label={`Close ${activePanel.title}`}
                  className="text-content-secondary"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </DropdownMenuPrimitive.Item>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                activePanel.className,
              )}
              data-slot="dropdown-menu-inline-sub-content"
            >
              <InlineSubmenuPanelContext.Provider value>
                {activePanel.children}
              </InlineSubmenuPanelContext.Provider>
            </div>
          </>
        ) : null}
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
  size = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  closeOnSelect?: boolean
  inset?: boolean
  variant?: "default" | "destructive"
  size?: "default" | "comfortable"
}) {
  const isInlineSubmenuPanel = React.useContext(InlineSubmenuPanelContext)
  const shouldCloseOnSelect = closeOnSelect ?? !isInlineSubmenuPanel

  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        menuItemVariants({ size, variant }),
        "group/dropdown-menu-item not-data-[variant=destructive]:focus:**:text-action-on-neutral data-inset:pl-7.5",
        className,
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
  closeOnSelect,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  closeOnSelect?: boolean
  inset?: boolean
}) {
  const isInlineSubmenuPanel = React.useContext(InlineSubmenuPanelContext)
  const shouldCloseOnSelect = closeOnSelect ?? !isInlineSubmenuPanel

  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        menuItemVariants(),
        "pr-8 focus:**:text-action-on-neutral data-inset:pl-7.5",
        className,
      )}
      checked={checked}
      {...props}
      onSelect={(event) => {
        onSelect?.(event)
        if (!shouldCloseOnSelect) event.preventDefault()
      }}
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
  closeOnSelect,
  onSelect,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  closeOnSelect?: boolean
  inset?: boolean
}) {
  const isInlineSubmenuPanel = React.useContext(InlineSubmenuPanelContext)
  const shouldCloseOnSelect = closeOnSelect ?? !isInlineSubmenuPanel

  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        menuItemVariants(),
        "pr-8 focus:**:text-action-on-neutral data-inset:pl-7.5",
        className,
      )}
      {...props}
      onSelect={(event) => {
        onSelect?.(event)
        if (!shouldCloseOnSelect) event.preventDefault()
      }}
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
        menuLabelClassName,
        "data-inset:pl-7.5",
        className,
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
      className={cn(menuSeparatorClassName, className)}
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
        "ml-auto text-[0.625rem] tracking-widest text-content-secondary group-focus/dropdown-menu-item:text-action-on-neutral",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  children,
  displayMode: requestedDisplayMode,
  title = "Submenu",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub> & {
  displayMode?: DropdownMenuSubDisplayMode
  title?: string
}) {
  const defaultSubDisplayMode = React.useContext(DropdownMenuDefaultSubModeContext)
  const displayMode = requestedDisplayMode ?? defaultSubDisplayMode
  const id = React.useId()
  const contextValue = React.useMemo(
    () => ({ displayMode, id, title }),
    [displayMode, id, title],
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
  size = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
  size?: "default" | "comfortable"
}) {
  const submenu = React.useContext(DropdownMenuSubContext)
  const inlineNavigation = React.useContext(InlineSubmenuNavigationContext)
  const registrationOnly = React.useContext(InlineSubmenuRegistrationContext)
  const triggerClassName = cn(
    menuItemVariants({ size }),
        "not-data-[variant=destructive]:focus:**:text-action-on-neutral data-inset:pl-7.5 data-open:bg-action-neutral-hover data-open:text-action-on-neutral",
    className,
  )

  if (submenu?.displayMode === "inline") {
    if (registrationOnly) return null

    return (
      <DropdownMenuPrimitive.Item
        data-slot="dropdown-menu-sub-trigger"
        data-inset={inset}
        className={triggerClassName}
        {...props}
        id={`${submenu.id}-trigger`}
        onKeyDown={(event) => {
          props.onKeyDown?.(event)
          if (!event.defaultPrevented && event.key === "ArrowRight" && !props.disabled) {
            event.preventDefault()
            inlineNavigation?.navigateTo(submenu.id)
          }
        }}
        onSelect={(event) => {
          event.preventDefault()
          inlineNavigation?.navigateTo(submenu.id)
        }}
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
  sideOffset = 4,
  collisionPadding = 8,
  width = "auto",
  padding = "menu",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent> & {
  width?: "auto" | "sm" | "md" | "lg" | "default" | "xl" | "fit"
  padding?: "none" | "menu" | "roomy" | "spacious"
}) {
  const submenu = React.useContext(DropdownMenuSubContext)
  const inlineNavigation = React.useContext(InlineSubmenuNavigationContext)
  const registerPanel = inlineNavigation?.registerPanel
  const panel = React.useMemo(
    () =>
      submenu
        ? { children, className, id: submenu.id, title: submenu.title }
        : null,
    [children, className, submenu],
  )

  React.useEffect(() => {
    if (submenu?.displayMode !== "inline" || !panel || !registerPanel) return
    registerPanel(panel)
  }, [panel, registerPanel, submenu?.displayMode])

  if (submenu?.displayMode === "inline") return null

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          menuContentVariants({ padding, width }),
          menuSurfaceVariants(),
          menuViewportClassName,
          className,
        )}
        {...props}
      >
        <InlineSubmenuPanelContext.Provider value={false}>
          {children}
        </InlineSubmenuPanelContext.Provider>
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
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
