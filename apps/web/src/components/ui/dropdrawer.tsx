"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const DropDrawerContext = React.createContext<{ isMobile: boolean }>({
  isMobile: false,
});
const SubmenuPanelContext = React.createContext(false);

const submenuAnimationVariants = {
  enter: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: "forward" | "backward") => ({
    x: direction === "forward" ? "-100%" : "100%",
    opacity: 0,
  }),
};

const submenuAnimationTransition = {
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1.0] as const,
};

type SubmenuNavigationState = {
  direction: "forward" | "backward";
  stack: { id: string; title: string }[];
};

const useDropDrawerContext = () => {
  const context = React.useContext(DropDrawerContext);
  if (!context) {
    throw new Error(
      "DropDrawer components cannot be rendered outside the DropDrawer Context",
    );
  }
  return context;
};

function DropDrawer({
  children,
  ...props
}:
  | React.ComponentProps<typeof Drawer>
  | React.ComponentProps<typeof DropdownMenu>) {
  const isMobile = useIsMobile();
  const DropdownComponent = isMobile ? Drawer : DropdownMenu;
  const contextValue = React.useMemo(() => ({ isMobile }), [isMobile]);

  return (
    <DropDrawerContext.Provider value={contextValue}>
      <DropdownComponent
        data-slot="drop-drawer"
        {...(isMobile && { autoFocus: true })}
        {...props}
      >
        {children}
      </DropdownComponent>
    </DropDrawerContext.Provider>
  );
}

function DropDrawerTrigger({
  className,
  children,
  ...props
}:
  | React.ComponentProps<typeof DrawerTrigger>
  | React.ComponentProps<typeof DropdownMenuTrigger>) {
  const { isMobile } = useDropDrawerContext();
  const TriggerComponent = isMobile ? DrawerTrigger : DropdownMenuTrigger;

  return (
    <TriggerComponent
      data-slot="drop-drawer-trigger"
      className={className}
      {...props}
    >
      {children}
    </TriggerComponent>
  );
}

function MobileDropDrawerContent({
  className,
  children,
  ...props
}:
  | React.ComponentProps<typeof DrawerContent>
  | React.ComponentProps<typeof DropdownMenuContent>) {
  const {
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    onCloseAutoFocus: _onCloseAutoFocus,
    ...drawerContentProps
  } = props as React.ComponentProps<typeof DropdownMenuContent> &
    React.ComponentProps<typeof DrawerContent>;
  const [submenuNavigation, setSubmenuNavigation] =
    React.useState<SubmenuNavigationState>({
      direction: "forward",
      stack: [],
    });
  const activeSubmenuEntry = submenuNavigation.stack.at(-1);
  const activeSubmenu = activeSubmenuEntry?.id ?? null;
  const submenuTitle = activeSubmenuEntry?.title ?? null;
  const animationDirection = submenuNavigation.direction;

  // Create a ref to store submenu content by ID
  const submenuContentRef = React.useRef<Map<string, React.ReactNode>>(
    new Map(),
  );
  const activeSubmenuRef = React.useRef(activeSubmenu);
  const [, rerenderActiveSubmenu] = React.useReducer(
    (version) => version + 1,
    0,
  );
  activeSubmenuRef.current = activeSubmenu;

  // Function to navigate to a submenu
  const navigateToSubmenu = React.useCallback((id: string, title: string) => {
    setSubmenuNavigation((currentNavigation) => {
      if (currentNavigation.stack.at(-1)?.id === id) return currentNavigation;

      return {
        direction: "forward",
        stack: [...currentNavigation.stack, { id, title }],
      };
    });
  }, []);

  // Function to go back to previous menu
  const goBack = React.useCallback(() => {
    setSubmenuNavigation((currentNavigation) => ({
      direction: "backward",
      stack: currentNavigation.stack.slice(0, -1),
    }));
  }, []);

  // Function to register submenu content
  const registerSubmenuContent = React.useCallback(
    (id: string, content: React.ReactNode) => {
      const currentContent = submenuContentRef.current.get(id);
      if (currentContent === content) return;

      submenuContentRef.current.set(id, content);
      if (activeSubmenuRef.current === id) rerenderActiveSubmenu();
    },
    [],
  );
  const submenuContextValue = React.useMemo(
    () => ({ navigateToSubmenu, registerSubmenuContent }),
    [navigateToSubmenu, registerSubmenuContent],
  );

  return (
    <SubmenuContext.Provider value={submenuContextValue}>
      <DrawerContent
        data-slot="drop-drawer-content"
        className={cn(
          "max-h-[85vh] bg-popover px-1 pb-2 text-popover-foreground",
          className,
        )}
        {...drawerContentProps}
      >
          {activeSubmenu ? (
            <>
              <div aria-hidden hidden inert>
                {children}
              </div>
              <DrawerHeader className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={goBack}
                    className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <DrawerTitle className="text-sm font-medium">
                    {submenuTitle || "Submenu"}
                  </DrawerTitle>
                  <DrawerClose asChild>
                    <Button
                      aria-label={`Close ${submenuTitle || "submenu"}`}
                      className="ml-auto text-muted-foreground"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </DrawerClose>
                </div>
              </DrawerHeader>
              <div className="relative max-h-[70vh] flex-1 overflow-y-auto">
                {/* Use AnimatePresence to handle exit animations */}
                <AnimatePresence
                  initial={false}
                  mode="wait"
                  custom={animationDirection}
                >
                  <motion.div
                    key={activeSubmenu || "main"}
                    custom={animationDirection}
                    variants={submenuAnimationVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={submenuAnimationTransition}
                    className="h-full w-full space-y-0.5 px-1 pb-2"
                  >
                    <SubmenuPanelContext.Provider value>
                      {submenuContentRef.current.get(activeSubmenu)}
                    </SubmenuPanelContext.Provider>
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          ) : (
            <>
              <DrawerHeader className="sr-only">
                <DrawerTitle>Menu</DrawerTitle>
              </DrawerHeader>
              <div className="max-h-[70vh] overflow-y-auto">
                <AnimatePresence
                  initial={false}
                  mode="wait"
                  custom={animationDirection}
                >
                  <motion.div
                    key="main-menu"
                    custom={animationDirection}
                    variants={submenuAnimationVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={submenuAnimationTransition}
                    className="w-full space-y-0.5 px-1 pb-2 pt-1"
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
      </DrawerContent>
    </SubmenuContext.Provider>
  );
}

function DropDrawerContent({
  className,
  children,
  ...props
}:
  | React.ComponentProps<typeof DrawerContent>
  | React.ComponentProps<typeof DropdownMenuContent>) {
  const { isMobile } = useDropDrawerContext();

  if (isMobile) {
    return (
      <MobileDropDrawerContent className={className} {...props}>
        {children}
      </MobileDropDrawerContent>
    );
  }

  return (
    <DropdownMenuContent
      data-slot="drop-drawer-content"
      align="end"
      sideOffset={4}
      className={className}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  );
}

function DropDrawerItem({
  className,
  children,
  onSelect,
  onClick,
  icon,
  variant = "default",
  inset,
  disabled,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  icon?: React.ReactNode;
}) {
  const { isMobile } = useDropDrawerContext();
  const isInSubmenu = React.useContext(SubmenuPanelContext);

  if (isMobile) {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (onClick) onClick(e);
      if (onSelect) onSelect(e as unknown as Event);
    };

    // Only wrap in DrawerClose if it's not a submenu item
    const content = (
      <div
        data-slot="drop-drawer-item"
        data-variant={variant}
        data-inset={inset}
        data-disabled={disabled}
        className={cn(
          "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-popover-foreground outline-hidden select-none hover:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
          inset && "pl-8",
          variant === "destructive" &&
            "text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:text-destructive",
          disabled &&
            "pointer-events-none text-muted-foreground opacity-60 hover:bg-transparent",
          className,
        )}
        onClick={handleClick}
        aria-disabled={disabled}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2">{children}</div>
        {icon && <div className="shrink-0 text-muted-foreground">{icon}</div>}
      </div>
    );

    if (isInSubmenu) {
      return content;
    }

    return <DrawerClose asChild>{content}</DrawerClose>;
  }

  return (
    <DropdownMenuItem
      data-slot="drop-drawer-item"
      className={className}
      onSelect={onSelect}
      onClick={onClick as React.MouseEventHandler<HTMLDivElement>}
      variant={variant}
      inset={inset}
      disabled={disabled}
      {...props}
    >
      {children}
      {icon}
    </DropdownMenuItem>
  );
}

function DropDrawerSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSeparator>) {
  const { isMobile } = useDropDrawerContext();

  // For mobile, render a simple divider
  if (isMobile) {
    return null;
  }

  // For desktop, use the standard dropdown separator
  return (
    <DropdownMenuSeparator
      data-slot="drop-drawer-separator"
      className={className}
      {...props}
    />
  );
}

function DropDrawerShortcut({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuShortcut>) {
  const { isMobile } = useDropDrawerContext();

  if (isMobile) {
    return null;
  }

  return (
    <DropdownMenuShortcut
      data-slot="drop-drawer-shortcut"
      className={className}
      {...props}
    />
  );
}

function DropDrawerLabel({
  className,
  children,
  ...props
}:
  | React.ComponentProps<typeof DropdownMenuLabel>
  | React.ComponentProps<typeof DrawerTitle>) {
  const { isMobile } = useDropDrawerContext();

  if (isMobile) {
    return (
      <DrawerHeader className="p-0">
        <DrawerTitle
          data-slot="drop-drawer-label"
          className={cn(
            "px-2 py-1.5 text-xs font-medium text-muted-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </DrawerTitle>
      </DrawerHeader>
    );
  }

  return (
    <DropdownMenuLabel
      data-slot="drop-drawer-label"
      className={className}
      {...props}
    >
      {children}
    </DropdownMenuLabel>
  );
}

function DropDrawerFooter({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerFooter> | React.ComponentProps<"div">) {
  const { isMobile } = useDropDrawerContext();

  if (isMobile) {
    return (
      <DrawerFooter
        data-slot="drop-drawer-footer"
        className={cn("p-2", className)}
        {...props}
      >
        {children}
      </DrawerFooter>
    );
  }

  // No direct equivalent in DropdownMenu, so we'll just render a div
  return (
    <div
      data-slot="drop-drawer-footer"
      className={cn("p-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function DropDrawerGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  children: React.ReactNode;
}) {
  const { isMobile } = useDropDrawerContext();

  // Add separators between children on mobile
  const childrenWithSeparators = React.useMemo(() => {
    if (!isMobile) return children;

    const childArray = React.Children.toArray(children);

    // Filter out any existing separators
    const filteredChildren = childArray.filter(
      (child) =>
        React.isValidElement(child) && child.type !== DropDrawerSeparator,
    );

    // Add separators between items
    return filteredChildren.flatMap((child, index) => {
      if (index === filteredChildren.length - 1) return [child];
      return [
        child,
        <div
          key={`separator-${index}`}
          className="bg-border h-px"
          aria-hidden="true"
        />,
      ];
    });
  }, [children, isMobile]);

  if (isMobile) {
    return (
      <div
        data-drop-drawer-group
        data-slot="drop-drawer-group"
        role="group"
        className={cn("my-1 overflow-hidden rounded-md", className)}
        {...props}
      >
        {childrenWithSeparators}
      </div>
    );
  }

  // On desktop, use a div with proper role and attributes
  return (
    <div
      data-drop-drawer-group
      data-slot="drop-drawer-group"
      role="group"
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}

// Context for managing submenu state on mobile
interface SubmenuContextType {
  navigateToSubmenu: (id: string, title: string) => void;
  registerSubmenuContent: (id: string, content: React.ReactNode) => void;
}

const SubmenuContext = React.createContext<SubmenuContextType | null>(null);

type SubmenuDefinition = {
  id: string;
  title: string;
};

const SubmenuDefinitionContext = React.createContext<SubmenuDefinition | null>(
  null,
);

// Submenu components
function DropDrawerSub({
  children,
  id,
  title,
  ...props
}: React.ComponentProps<typeof DropdownMenuSub> & {
  id?: string;
}) {
  const { isMobile } = useDropDrawerContext();
  const submenuNavigation = React.useContext(SubmenuContext);

  const generatedId = React.useId();
  const submenuId = id || `submenu-${generatedId}`;
  const submenuDefinition = React.useMemo(
    () => ({ id: submenuId, title: title || "Submenu" }),
    [submenuId, title],
  );

  // Extract submenu content to register with parent
  React.useEffect(() => {
    if (!isMobile || !submenuNavigation) return;

    // Find the SubContent within this Sub
    let submenuContent: React.ReactNode;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === DropDrawerSubContent) {
        submenuContent = (child.props as { children?: React.ReactNode })
          .children;
      }
    });

    // Register the content with the parent
    if (submenuContent !== undefined) {
      submenuNavigation.registerSubmenuContent(submenuId, submenuContent);
    }
  }, [children, isMobile, submenuId, submenuNavigation]);

  if (isMobile) {
    return (
      <SubmenuDefinitionContext.Provider value={submenuDefinition}>
        <div
          data-slot="drop-drawer-sub"
          data-submenu-id={submenuId}
          id={submenuId}
        >
          {children}
        </div>
      </SubmenuDefinitionContext.Provider>
    );
  }

  // For desktop, pass the generated ID to the DropdownMenuSub
  return (
    <DropdownMenuSub
      data-slot="drop-drawer-sub"
      data-submenu-id={submenuId}
      title={title}
      // Don't pass id to DropdownMenuSub as it doesn't accept this prop
      {...props}
    >
      {children}
    </DropdownMenuSub>
  );
}

function DropDrawerSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubTrigger> & {
  icon?: React.ReactNode;
}) {
  const { isMobile } = useDropDrawerContext();
  const submenuNavigation = React.useContext(SubmenuContext);
  const submenuDefinition = React.useContext(SubmenuDefinitionContext);

  if (isMobile) {
    const { onClick, ...restProps } = props;
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || !submenuDefinition || !submenuNavigation)
        return;

      e.preventDefault();
      e.stopPropagation();
      submenuNavigation.navigateToSubmenu(
        submenuDefinition.id,
        submenuDefinition.title,
      );
    };

    // Don't wrap in DrawerClose for submenu triggers
    return (
      <div
        data-slot="drop-drawer-sub-trigger"
        data-inset={inset}
        className={cn(
          "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-popover-foreground outline-hidden select-none hover:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
          inset && "pl-8",
          className,
        )}
        onClick={handleClick}
        {...restProps}
      >
        <div className="flex min-w-0 items-center gap-2">{children}</div>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <DropdownMenuSubTrigger
      data-slot="drop-drawer-sub-trigger"
      data-inset={inset}
      className={className}
      inset={inset}
      {...props}
    >
      {children}
    </DropdownMenuSubTrigger>
  );
}

function DropDrawerSubContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuSubContent>) {
  const { isMobile } = useDropDrawerContext();

  if (isMobile) {
    // For mobile, we don't render the content directly
    // It will be rendered by the DropDrawerContent component when active
    return null;
  }

  return (
    <DropdownMenuSubContent
      data-slot="drop-drawer-sub-content"
      sideOffset={sideOffset}
      className={className}
      {...props}
    >
      {children}
    </DropdownMenuSubContent>
  );
}

export {
  DropDrawer,
  DropDrawerContent,
  DropDrawerFooter,
  DropDrawerGroup,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
};
