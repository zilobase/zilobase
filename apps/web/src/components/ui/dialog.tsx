"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"

const DialogContext = React.createContext({ isMobile: false })

function useDialogContext() {
  return React.useContext(DialogContext)
}

function Dialog({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const isMobile = useIsMobile()
  const DialogComponent = isMobile ? Drawer : DialogPrimitive.Root

  return (
    <DialogContext.Provider value={{ isMobile }}>
      <DialogComponent
        data-slot="dialog"
        {...(isMobile ? { autoFocus: true } : {})}
        {...props}
      >
        {children}
      </DialogComponent>
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const { isMobile } = useDialogContext()
  const TriggerComponent = isMobile ? DrawerTrigger : DialogPrimitive.Trigger

  return <TriggerComponent data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const { isMobile } = useDialogContext()
  const PortalComponent = isMobile ? DrawerPortal : DialogPrimitive.Portal

  return <PortalComponent data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const { isMobile } = useDialogContext()
  const CloseComponent = isMobile ? DrawerClose : DialogPrimitive.Close

  return <CloseComponent data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { isMobile } = useDialogContext()

  if (isMobile) {
    return (
      <DrawerOverlay
        data-slot="dialog-overlay"
        className={className}
        {...props}
      />
    )
  }

  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-scrim duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  hideMobileDragHandle = false,
  overlayClassName,
  showCloseButton = true,
  unstyledContent = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  hideMobileDragHandle?: boolean
  overlayClassName?: string
  showCloseButton?: boolean
  unstyledContent?: boolean
}) {
  const { isMobile } = useDialogContext()

  if (isMobile) {
    const {
      onCloseAutoFocus: _onCloseAutoFocus,
      onOpenAutoFocus: _onOpenAutoFocus,
      ...drawerContentProps
    } = props

    return (
      <DrawerContent
        data-slot="dialog-content"
        className={cn(
          "max-h-[85vh] bg-popover px-4 pb-4 text-xs/relaxed text-popover-foreground",
          className,
        )}
        overlayClassName={overlayClassName}
        {...drawerContentProps}
      >
        {unstyledContent ? (
          children
        ) : (
          <div className="grid gap-4 overflow-y-auto pt-4">{children}</div>
        )}
        {showCloseButton && (
          <DrawerClose data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DrawerClose>
        )}
      </DrawerContent>
    )
  }

  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-xs/relaxed text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {hideMobileDragHandle ? null : (
          <div className="mx-auto -mt-1 h-1 w-[100px] shrink-0 rounded-full bg-muted sm:hidden" />
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const { isMobile } = useDialogContext()
  const TitleComponent = isMobile ? DrawerTitle : DialogPrimitive.Title

  return (
    <TitleComponent
      data-slot="dialog-title"
      className={cn("font-heading text-sm font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const { isMobile } = useDialogContext()
  const DescriptionComponent = isMobile
    ? DrawerDescription
    : DialogPrimitive.Description

  return (
    <DescriptionComponent
      data-slot="dialog-description"
      className={cn(
        "text-xs/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
