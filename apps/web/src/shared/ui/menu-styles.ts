import { cva, type VariantProps } from "class-variance-authority"

// View Settings is the visual baseline for action menus and option lists.
// Every menu primitive consumes these variants so its interaction library does
// not determine its visual language.
export const menuSurfaceVariants = cva(
  "rounded-lg bg-surface-overlay text-content-primary ring-1 ring-stroke-default",
  {
    variants: {
      elevation: {
        default: "shadow-md",
        none: "shadow-none",
      },
    },
    defaultVariants: {
      elevation: "default",
    },
  },
)

export const menuViewportClassName =
  "max-h-[min(36rem,calc(100vh-1rem),var(--radix-dropdown-menu-content-available-height,100vh),var(--radix-select-content-available-height,100vh),var(--radix-context-menu-content-available-height,100vh),var(--radix-popover-content-available-height,100vh))] max-w-[min(20rem,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto overscroll-contain"

export const menuContentVariants = cva("", {
  variants: {
    padding: {
      none: "p-0",
      menu: "p-1",
      roomy: "p-2",
      spacious: "p-3",
    },
    width: {
      auto: "w-auto",
      sm: "w-44",
      md: "w-56",
      lg: "w-64",
      default: "w-72",
      xl: "w-80",
      fit: "w-fit",
    },
  },
})

export const menuItemVariants = cva(
  "relative my-0.5 flex cursor-default items-center gap-2 rounded-md outline-hidden select-none focus:bg-action-neutral-hover focus:text-action-on-neutral data-selected:bg-action-neutral-hover data-selected:text-action-on-neutral data-disabled:pointer-events-none data-disabled:opacity-50 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      size: {
        default: "min-h-7 px-2 py-1 text-[13px]/relaxed",
        comfortable: "min-h-9 px-2 py-2 text-[13px]/relaxed",
      },
      variant: {
        default: "",
        destructive:
          "text-action-danger-text focus:bg-feedback-error-subtle focus:text-action-danger-text data-selected:bg-feedback-error-subtle data-selected:text-action-danger-text [&_svg]:text-action-danger-text",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
)

export const menuLabelClassName =
  "px-2 py-1.5 text-xs text-content-secondary"

export const menuSeparatorClassName = "-mx-1 my-1 h-px bg-stroke-default"

export type MenuItemVariantProps = VariantProps<typeof menuItemVariants>
export type MenuContentVariantProps = VariantProps<typeof menuContentVariants>
export type MenuSurfaceVariantProps = VariantProps<typeof menuSurfaceVariants>
