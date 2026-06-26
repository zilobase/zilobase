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
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
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
  showCloseButton = true,
  unstyledContent = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  hideMobileDragHandle?: boolean
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
          "max-h-[85vh] bg-popover px-4 pb-4 text-popover-foreground",
          className
        )}
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
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 grid max-h-[85vh] w-full gap-4 overflow-y-auto rounded-t-xl border-t bg-popover p-4 text-sm text-popover-foreground duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 max-sm:data-open:slide-in-from-bottom-10 max-sm:data-closed:slide-out-to-bottom-10 sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:max-h-[calc(100vh-2rem)] sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-visible sm:rounded-xl sm:border-t-0 sm:ring-1 sm:ring-foreground/10 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
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
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
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
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end sm:rounded-b-xl",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
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
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
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
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
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
