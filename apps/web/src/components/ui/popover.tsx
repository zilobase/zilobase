"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

const PopoverContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
})

function Popover({
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const isMobile = useIsMobile()
  const PopoverComponent = isMobile ? Drawer : PopoverPrimitive.Root

  return (
    <PopoverContext.Provider value={{ isMobile }}>
      <PopoverComponent data-slot="popover" {...props}>
        {children}
      </PopoverComponent>
    </PopoverContext.Provider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const { isMobile } = React.useContext(PopoverContext)
  const TriggerComponent = isMobile ? DrawerTrigger : PopoverPrimitive.Trigger

  return <TriggerComponent data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  children,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const { isMobile } = React.useContext(PopoverContext)
  const {
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    alignOffset: _alignOffset,
    avoidCollisions: _avoidCollisions,
    collisionBoundary: _collisionBoundary,
    collisionPadding: _collisionPadding,
    sticky: _sticky,
    hideWhenDetached: _hideWhenDetached,
    updatePositionStrategy: _updatePositionStrategy,
    onOpenAutoFocus: _onOpenAutoFocus,
    onCloseAutoFocus: _onCloseAutoFocus,
    onEscapeKeyDown: _onEscapeKeyDown,
    onPointerDownOutside: _onPointerDownOutside,
    onFocusOutside: _onFocusOutside,
    onInteractOutside: _onInteractOutside,
    ...drawerContentProps
  } = props as React.ComponentProps<typeof PopoverPrimitive.Content> &
    React.ComponentProps<typeof DrawerContent>

  if (isMobile) {
    return (
      <DrawerContent
        data-slot="popover-content"
        className="max-h-[85vh] bg-popover px-1 pb-2 text-popover-foreground"
        {...drawerContentProps}
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>Popover</DrawerTitle>
        </DrawerHeader>
        <div
          className={cn(
            "max-h-[70vh] w-full max-w-none overflow-y-auto text-sm",
            className,
            "max-h-[70vh] w-full max-w-none"
          )}
        >
          {children}
        </div>
      </DrawerContent>
    )
  }

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  const { isMobile } = React.useContext(PopoverContext)

  if (isMobile) {
    return <div data-slot="popover-anchor" {...props} />
  }

  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
