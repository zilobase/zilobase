"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/shared/lib/utils";
import { buttonControlHeightClassName, buttonControlTextClassName } from "@/shared/ui/button";

const tabsVariants = cva(
  "flex data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
  {
    variants: {
      gap: {
        comfortable: "gap-4",
        default: "gap-2",
        none: "gap-0",
        spacious: "gap-6",
      },
    },
    defaultVariants: {
      gap: "default",
    },
  },
);

const tabsListVariants = cva(
  "flex items-center gap-0.5 rounded-lg p-0 text-content-secondary data-[orientation=vertical]:flex-col",
  {
    variants: {
      align: {
        start: "justify-start",
        center: "justify-center",
        end: "justify-end",
      },
      overflow: {
        visible: "overflow-visible",
        scroll: "min-w-0 overflow-x-auto",
        hidden: "overflow-hidden",
      },
      width: {
        fit: "w-fit",
        full: "w-full",
        max: "w-max",
      },
    },
    defaultVariants: {
      align: "start",
      overflow: "visible",
      width: "fit",
    },
  },
);

const tabsTriggerVariants = cva(
  cn(
    buttonControlHeightClassName,
    buttonControlTextClassName,
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-3 py-0.5 text-content-secondary outline-none transition-none hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring active:bg-action-neutral-pressed active:text-action-on-neutral data-active:bg-action-neutral-hover data-active:text-action-on-neutral data-active:hover:bg-action-neutral-pressed data-active:hover:text-action-on-neutral data-active:active:bg-action-neutral-pressed data-active:active:text-action-on-neutral aria-[current=page]:bg-action-neutral-hover aria-[current=page]:text-action-on-neutral aria-[current=page]:hover:bg-action-neutral-pressed aria-[current=page]:hover:text-action-on-neutral aria-[current=page]:active:bg-action-neutral-pressed aria-[current=page]:active:text-action-on-neutral data-disabled:pointer-events-none data-disabled:opacity-50 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start dark:text-content-secondary dark:hover:text-content-primary dark:data-active:text-content-primary dark:aria-[current=page]:text-content-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      size: {
        compact: "min-w-8 px-2",
        default: "",
      },
      width: {
        content: "grow-0",
        equal: "grow",
      },
    },
    defaultVariants: {
      size: "default",
      width: "equal",
    },
  },
);

const tabsBadgeVariants = cva(
  "rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] tabular-nums text-content-secondary",
);

export function getAppTabTriggerClassName(
  className?: string,
  options?: VariantProps<typeof tabsTriggerVariants>,
) {
  return cn(tabsTriggerVariants(options), className);
}

export function Tabs({
  className,
  gap = "default",
  ...props
}: TabsPrimitive.Root.Props & VariantProps<typeof tabsVariants>): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn(tabsVariants({ gap }), className)}
      data-gap={gap}
      data-slot="tabs"
      {...props}
    />
  );
}

export function TabsList({
  align = "start",
  className,
  overflow = "visible",
  width = "fit",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={cn(tabsListVariants({ align, overflow, width }), className)}
      data-align={align}
      data-overflow={overflow}
      data-slot="tabs-list"
      data-width={width}
      {...props}
    />
  );
}

function TabsTab({
  className,
  size = "default",
  width = "equal",
  ...props
}: TabsPrimitive.Tab.Props & VariantProps<typeof tabsTriggerVariants>): React.ReactElement {
  return (
    <TabsPrimitive.Tab
      className={
        typeof className === "function"
          ? (state) => getAppTabTriggerClassName(className(state), { size, width })
          : getAppTabTriggerClassName(className, { size, width })
      }
      data-size={size}
      data-slot="tabs-tab"
      data-width={width}
      {...props}
    />
  );
}

function TabsBadge({ className, ...props }: React.ComponentProps<"span">): React.ReactElement {
  return <span className={cn(tabsBadgeVariants(), className)} data-slot="tabs-badge" {...props} />;
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 text-xs/relaxed outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export {
  TabsBadge,
  TabsTab as TabsTrigger,
  TabsPanel as TabsContent,
  tabsBadgeVariants,
  tabsListVariants,
  tabsTriggerVariants,
  tabsVariants,
};
