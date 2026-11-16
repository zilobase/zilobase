// Source: https://ui.shadcn.com/r/styles/radix-mira/bubble.json
// Retrieved 2026-10-20; SHA-256 4151a35e305ee6d54735f2d32fbb3070aee09d42aa9b00f6742bf70b5c2aa3f3.
// Adaptations: local imports, Lucide icons and Zilobase semantic colors.
// MIT license: ./ai-elements.LICENSE
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-group"
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

const bubbleVariants = cva(
  "group/bubble relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[align=end]:self-end data-[variant=ghost]:max-w-full",
  {
    variants: {
      variant: {
        default:
          "*:data-[slot=bubble-content]:bg-action-primary *:data-[slot=bubble-content]:text-action-on-primary [&>[data-slot=bubble-content]:is(button,a):hover]:bg-action-primary-hover",
        secondary:
          "*:data-[slot=bubble-content]:bg-action-secondary *:data-[slot=bubble-content]:text-action-on-secondary [&>[data-slot=bubble-content]:is(button,a):hover]:bg-action-secondary-hover",
        muted:
          "*:data-[slot=bubble-content]:bg-surface-secondary [&>[data-slot=bubble-content]:is(button,a):hover]:bg-action-secondary-hover",
        tinted:
          "*:data-[slot=bubble-content]:bg-action-selected-subtle *:data-[slot=bubble-content]:text-content-primary dark:*:data-[slot=bubble-content]:bg-action-selected-subtle [&>[data-slot=bubble-content]:is(button,a):hover]:bg-action-selected-subtle dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-action-selected-subtle",
        outline:
          "*:data-[slot=bubble-content]:border-stroke-default *:data-[slot=bubble-content]:bg-surface-canvas [&>[data-slot=bubble-content]:is(button,a):hover]:bg-surface-secondary [&>[data-slot=bubble-content]:is(button,a):hover]:text-content-primary dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-control-background",
        ghost:
          "border-none *:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0 [&>[data-slot=bubble-content]:is(button,a):hover]:bg-surface-secondary [&>[data-slot=bubble-content]:is(button,a):hover]:text-content-primary dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-surface-secondary",
        destructive:
          "*:data-[slot=bubble-content]:bg-feedback-error-subtle *:data-[slot=bubble-content]:text-action-danger-text dark:*:data-[slot=bubble-content]:bg-feedback-error-subtle [&>[data-slot=bubble-content]:is(button,a):hover]:bg-feedback-error-subtle dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-feedback-error-subtle",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    align?: "start" | "end";
  }) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  );
}

function BubbleContent({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="bubble-content"
      className={cn(
        "w-fit max-w-full min-w-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-1.5 text-xs/relaxed wrap-break-word group-data-[align=end]/bubble:self-end [button]:text-left [button,a]:transition-colors [button,a]:outline-none [button,a]:focus-visible:border-action-focus-ring [button,a]:focus-visible:ring-2 [button,a]:focus-visible:ring-action-focus-ring",
        className,
      )}
      {...props}
    />
  );
}

const bubbleReactionsVariants = cva(
  "absolute z-10 flex w-fit shrink-0 items-center justify-center gap-1 rounded-full bg-surface-secondary px-1.5 py-0.5 text-xs ring-2 ring-surface-canvas has-[button]:p-0",
  {
    variants: {
      side: {
        top: "top-0 -translate-y-3/4",
        bottom: "bottom-0 translate-y-3/4",
      },
      align: {
        start: "left-3",
        end: "right-3",
      },
    },
    defaultVariants: {
      side: "bottom",
      align: "end",
    },
  },
);

function BubbleReactions({
  side = "bottom",
  align = "end",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "start" | "end";
  side?: "top" | "bottom";
}) {
  return (
    <div
      data-slot="bubble-reactions"
      data-align={align}
      data-side={side}
      className={cn(bubbleReactionsVariants({ side, align }), className)}
      {...props}
    />
  );
}

export { BubbleGroup, Bubble, BubbleContent, BubbleReactions };
