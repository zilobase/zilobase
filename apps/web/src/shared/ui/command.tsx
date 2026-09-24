import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/shared/ui/input-group";
import { SearchIcon, CheckIcon } from "@/shared/components/icons";
import { menuItemVariants, menuSeparatorClassName } from "@/shared/ui/menu-styles";

const commandVariants = cva(
  "flex size-full flex-col overflow-hidden bg-surface-overlay text-content-primary",
  {
    variants: {
      variant: {
        default: "rounded-xl p-1",
        menu: "rounded-none bg-transparent p-1",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const CommandVariantContext = React.createContext<"default" | "menu">("default");

function Command({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof CommandPrimitive> & VariantProps<typeof commandVariants>) {
  return (
    <CommandVariantContext.Provider value={variant ?? "default"}>
      <CommandPrimitive
        data-slot="command"
        data-variant={variant}
        className={cn(commandVariants({ variant }), className)}
        {...props}
      />
    </CommandVariantContext.Provider>
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0", className)}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  const variant = React.useContext(CommandVariantContext);
  return (
    <div data-slot="command-input-wrapper" className={variant === "menu" ? "p-0 pb-1" : "p-1 pb-0"}>
      <InputGroup className="h-7! bg-control-background dark:bg-control-background">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "w-full text-xs/relaxed outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-3.5 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-xs/relaxed", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  const variant = React.useContext(CommandVariantContext);
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        variant === "menu"
          ? "overflow-hidden text-content-primary **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:text-content-secondary"
          : "overflow-hidden p-1 text-content-primary **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-content-secondary",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn(menuSeparatorClassName, className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  size = "default",
  variant: itemVariant = "default",
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & {
  size?: "default" | "comfortable";
  variant?: "default" | "destructive";
}) {
  const commandVariant = React.useContext(CommandVariantContext);
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      data-variant={itemVariant}
      className={cn(
        commandVariant === "menu"
          ? menuItemVariants({ size, variant: itemVariant })
          : "relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none in-data-[slot=dialog-content]:rounded-md data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-surface-muted data-selected:text-content-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 data-selected:*:[svg]:text-content-primary",
        "group/command-item",
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-[0.625rem] tracking-widest text-content-secondary group-data-selected/command-item:text-content-primary",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
