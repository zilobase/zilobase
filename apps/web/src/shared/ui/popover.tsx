import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";
import { menuSurfaceVariants, menuViewportClassName } from "@/shared/ui/menu-styles";

const popoverContentVariants = cva(
  "z-50 flex origin-(--radix-popover-content-transform-origin) flex-col rounded-lg bg-surface-overlay text-xs text-content-primary shadow-md ring-1 ring-stroke-default outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
  {
    variants: {
      width: {
        default: "w-72",
        sm: "w-44",
        md: "w-56",
        lg: "w-64",
        xl: "w-80",
        auto: "w-auto",
        fit: "w-fit",
      },
      padding: {
        none: "p-0",
        menu: "p-1",
        default: "p-2.5",
        roomy: "p-3",
        spacious: "p-4",
      },
      gap: {
        none: "gap-0",
        compact: "gap-1",
        default: "gap-4",
      },
      variant: {
        default: "",
        menu: "text-[13px]",
      },
    },
    defaultVariants: {
      width: "default",
      variant: "default",
    },
  },
);

const wideMenuViewportClassName =
  "max-h-[min(36rem,calc(100vh-1rem),var(--radix-popover-content-available-height,100vh))] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  variant = "default",
  width = "default",
  padding,
  gap,
  viewport = "menu",
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> &
  VariantProps<typeof popoverContentVariants> & {
    viewport?: "menu" | "wide";
  }) {
  const resolvedPadding = padding ?? (variant === "menu" ? "menu" : "default");
  const resolvedGap = gap ?? (variant === "menu" ? "none" : "default");
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-variant={variant}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          popoverContentVariants({
            gap: resolvedGap,
            padding: resolvedPadding,
            variant,
            width,
          }),
          variant === "menu" && [
            menuSurfaceVariants(),
            viewport === "wide" ? wideMenuViewportClassName : menuViewportClassName,
          ],
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-xs", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div data-slot="popover-title" className={cn("text-sm font-medium", className)} {...props} />
  );
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-content-secondary", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
