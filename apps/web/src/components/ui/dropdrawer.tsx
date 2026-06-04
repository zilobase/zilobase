"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";

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

const useDropDrawerContext = () => {
  const context = React.useContext(DropDrawerContext);
  if (!context) {
    throw new Error(
      "DropDrawer components cannot be rendered outside the DropDrawer Context"
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

  return (
    <DropDrawerContext.Provider value={{ isMobile }}>
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

function DropDrawerContent({
  className,
  children,
  ...props
}:
  | React.ComponentProps<typeof DrawerContent>
  | React.ComponentProps<typeof DropdownMenuContent>) {
  const { isMobile } = useDropDrawerContext();
  const {
    align: _align,
    side: _side,
    sideOffset: _sideOffset,
    onCloseAutoFocus: _onCloseAutoFocus,
    ...drawerContentProps
  } = props as React.ComponentProps<typeof DropdownMenuContent> &
    React.ComponentProps<typeof DrawerContent>;
  const [activeSubmenu, setActiveSubmenu] = React.useState<string | null>(null);
  const [submenuTitle, setSubmenuTitle] = React.useState<string | null>(null);
  const [submenuStack, setSubmenuStack] = React.useState<
    { id: string; title: string }[]
  >([]);
  // Add animation direction state
  const [animationDirection, setAnimationDirection] = React.useState<
    "forward" | "backward"
  >("forward");

  // Create a ref to store submenu content by ID
  const submenuContentRef = React.useRef<Map<string, React.ReactNode[]>>(
    new Map()
  );

  // Function to navigate to a submenu
  const navigateToSubmenu = React.useCallback((id: string, title: string) => {
    // Set animation direction to forward when navigating to a submenu
    setAnimationDirection("forward");
    setActiveSubmenu(id);
    setSubmenuTitle(title);
    setSubmenuStack((prev) => [...prev, { id, title }]);
  }, []);

  // Function to go back to previous menu
  const goBack = React.useCallback(() => {
    // Set animation direction to backward when going back
    setAnimationDirection("backward");

    if (submenuStack.length <= 1) {
      // If we're at the first level, go back to main menu
      setActiveSubmenu(null);
      setSubmenuTitle(null);
      setSubmenuStack([]);
    } else {
      // Go back to previous submenu
      const newStack = [...submenuStack];
      newStack.pop(); // Remove current
      const previous = newStack[newStack.length - 1];
      setActiveSubmenu(previous.id);
      setSubmenuTitle(previous.title);
      setSubmenuStack(newStack);
    }
  }, [submenuStack]);

  // Function to register submenu content
  const registerSubmenuContent = React.useCallback(
    (id: string, content: React.ReactNode[]) => {
      submenuContentRef.current.set(id, content);
    },
    []
  );

  // Function to extract submenu content
  const extractSubmenuContent = React.useCallback(
    (elements: React.ReactNode, targetId: string): React.ReactNode[] => {
      const result: React.ReactNode[] = [];

      // Recursive function to search through all children
      const findSubmenuContent = (node: React.ReactNode) => {
        // Skip if not a valid element
        if (!React.isValidElement(node)) return;

        const element = node as React.ReactElement;
        // Use a more specific type to avoid 'any'
        const props = element.props as {
          id?: string;
          "data-submenu-id"?: string;
          children?: React.ReactNode;
        };

        // Check if this is a DropDrawerSub
        if (element.type === DropDrawerSub) {
          // Get all possible ID values
          const elementId = props.id;
          const dataSubmenuId = props["data-submenu-id"];

          // If this is the submenu we're looking for
          if (elementId === targetId || dataSubmenuId === targetId) {
            // Find the SubContent within this Sub
            if (props.children) {
              React.Children.forEach(props.children, (child) => {
                if (
                  React.isValidElement(child) &&
                  child.type === DropDrawerSubContent
                ) {
                  // Add all children of the SubContent to the result
                  const subContentProps = child.props as {
                    children?: React.ReactNode;
                  };
                  if (subContentProps.children) {
                    React.Children.forEach(
                      subContentProps.children,
                      (contentChild) => {
                        result.push(contentChild);
                      }
                    );
                  }
                }
              });
            }
            return; // Found what we needed, no need to search deeper
          }
        }

        // If this element has children, search through them
        if (props.children) {
          if (Array.isArray(props.children)) {
            props.children.forEach((child: React.ReactNode) =>
              findSubmenuContent(child)
            );
          } else {
            findSubmenuContent(props.children);
          }
        }
      };

      // Start the search from the root elements
      if (Array.isArray(elements)) {
        elements.forEach((child) => findSubmenuContent(child));
      } else {
        findSubmenuContent(elements);
      }

      return result;
    },
    []
  );

  // Get submenu content (either from cache or extract it)
  const getSubmenuContent = React.useCallback(
    (id: string) => {
      // Check if we have the content in our ref
      const cachedContent = submenuContentRef.current.get(id || "");
      if (cachedContent && cachedContent.length > 0) {
        return cachedContent;
      }

      // If not in cache, extract it
      const submenuContent = extractSubmenuContent(children, id);

      if (submenuContent.length === 0) {
        return [];
      }

      // Store in cache for future use
      if (id) {
        submenuContentRef.current.set(id, submenuContent);
      }

      return submenuContent;
    },
    [children, extractSubmenuContent]
  );

  // Animation variants for Framer Motion
  const variants = {
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

  // Animation transition
  const transition = {
    duration: 0.3,
    ease: [0.25, 0.1, 0.25, 1.0] as const,
  };

  if (isMobile) {
    return (
      <SubmenuContext.Provider
        value={{
          activeSubmenu,
          setActiveSubmenu: (id) => {
            if (id === null) {
              setActiveSubmenu(null);
              setSubmenuTitle(null);
              setSubmenuStack([]);
            }
          },
          submenuTitle,
          setSubmenuTitle,
          navigateToSubmenu,
          registerSubmenuContent,
        }}
      >
        <DrawerContent
          data-slot="drop-drawer-content"
          className="max-h-[85vh] bg-popover px-1 pb-2 text-popover-foreground"
          {...drawerContentProps}
        >
          {activeSubmenu ? (
            <>
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
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
                    className="h-full w-full space-y-0.5 px-1 pb-2"
                  >
                    {activeSubmenu
                      ? getSubmenuContent(activeSubmenu)
                      : children}
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
                    variants={variants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={transition}
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

  return (
    <SubmenuContext.Provider
      value={{
        activeSubmenu,
        setActiveSubmenu,
        submenuTitle,
        setSubmenuTitle,
        registerSubmenuContent,
      }}
    >
      <DropdownMenuContent
        data-slot="drop-drawer-content"
        align="end"
        sideOffset={4}
        className={className}
        {...props}
      >
        {children}
      </DropdownMenuContent>
    </SubmenuContext.Provider>
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
          "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-popover-foreground outline-hidden select-none hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
          inset && "pl-8",
          variant === "destructive" &&
            "text-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:text-destructive",
          disabled &&
            "pointer-events-none text-muted-foreground opacity-60 hover:bg-transparent",
          className
        )}
        onClick={handleClick}
        aria-disabled={disabled}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2">{children}</div>
        {icon && <div className="shrink-0 text-muted-foreground">{icon}</div>}
      </div>
    );

    // Check if this is inside a submenu
    const isInSubmenu =
      (props as Record<string, unknown>)["data-parent-submenu-id"] ||
      (props as Record<string, unknown>)["data-parent-submenu"];

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
            className
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
        React.isValidElement(child) && child.type !== DropDrawerSeparator
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
  activeSubmenu: string | null;
  setActiveSubmenu: (id: string | null) => void;
  submenuTitle: string | null;
  setSubmenuTitle: (title: string | null) => void;
  navigateToSubmenu?: (id: string, title: string) => void;
  registerSubmenuContent?: (id: string, content: React.ReactNode[]) => void;
}

const SubmenuContext = React.createContext<SubmenuContextType>({
  activeSubmenu: null,
  setActiveSubmenu: () => {},
  submenuTitle: null,
  setSubmenuTitle: () => {},
  navigateToSubmenu: undefined,
  registerSubmenuContent: undefined,
});

// Submenu components
// Counter for generating simple numeric IDs
let submenuIdCounter = 0;

function DropDrawerSub({
  children,
  id,
  ...props
}: React.ComponentProps<typeof DropdownMenuSub> & {
  id?: string;
}) {
  const { isMobile } = useDropDrawerContext();
  const { registerSubmenuContent } = React.useContext(SubmenuContext);

  // Generate a simple numeric ID instead of using React.useId()
  const [generatedId] = React.useState(() => `submenu-${submenuIdCounter++}`);
  const submenuId = id || generatedId;

  // Extract submenu content to register with parent
  React.useEffect(() => {
    if (!registerSubmenuContent) return;

    // Find the SubContent within this Sub
    const contentItems: React.ReactNode[] = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === DropDrawerSubContent) {
        // Add all children of the SubContent to the result
        React.Children.forEach(
          (child.props as { children?: React.ReactNode }).children,
          (contentChild) => {
            contentItems.push(contentChild);
          }
        );
      }
    });

    // Register the content with the parent
    if (contentItems.length > 0) {
      registerSubmenuContent(submenuId, contentItems);
    }
  }, [children, registerSubmenuContent, submenuId]);

  if (isMobile) {
    // For mobile, we'll use the context to manage submenu state
    // Process children to pass the submenu ID to the trigger and content
    const processedChildren = React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) return child;

      if (child.type === DropDrawerSubTrigger) {
        return React.cloneElement(
          child as React.ReactElement,
          {
            ...(child.props as object),
            "data-parent-submenu-id": submenuId,
            "data-submenu-id": submenuId,
            // Use only data attributes, not custom props
            "data-parent-submenu": submenuId,
          } as React.HTMLAttributes<HTMLElement>
        );
      }

      if (child.type === DropDrawerSubContent) {
        return React.cloneElement(
          child as React.ReactElement,
          {
            ...(child.props as object),
            "data-parent-submenu-id": submenuId,
            "data-submenu-id": submenuId,
            // Use only data attributes, not custom props
            "data-parent-submenu": submenuId,
          } as React.HTMLAttributes<HTMLElement>
        );
      }

      return child;
    });

    return (
      <div
        data-slot="drop-drawer-sub"
        data-submenu-id={submenuId}
        id={submenuId}
      >
        {processedChildren}
      </div>
    );
  }

  // For desktop, pass the generated ID to the DropdownMenuSub
  return (
    <DropdownMenuSub
      data-slot="drop-drawer-sub"
      data-submenu-id={submenuId}
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
  const { navigateToSubmenu } = React.useContext(SubmenuContext);

  if (isMobile) {
    // Find the parent submenu ID
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Get the closest parent with data-submenu-id attribute
      const element = e.currentTarget as HTMLElement;
      let submenuId: string | null = null;

      // First check if the element itself has the data attribute
      if (element.closest("[data-submenu-id]")) {
        const closestElement = element.closest("[data-submenu-id]");
        const id = closestElement?.getAttribute("data-submenu-id");
        if (id) {
          submenuId = id;
        }
      }

      // If not found, try props
      if (!submenuId) {
        submenuId =
          ((props as Record<string, unknown>)[
            "data-parent-submenu-id"
          ] as string) ||
          ((props as Record<string, unknown>)["data-parent-submenu"] as string);
      }

      if (!submenuId) {
        return;
      }

      // Get the title
      const title = typeof children === "string" ? children : "Submenu";

      // Navigate to the submenu
      if (navigateToSubmenu) {
        navigateToSubmenu(submenuId, title);
      }
    };

    // Combine onClick handlers
    const combinedOnClick = (e: React.MouseEvent) => {
      // Call the original onClick if provided
      const typedProps = props as Record<string, unknown>;
      if (typedProps.onClick) {
        const originalOnClick =
          typedProps.onClick as React.MouseEventHandler<HTMLDivElement>;
        originalOnClick(e as React.MouseEvent<HTMLDivElement>);
      }

      // Call our navigation handler
      handleClick(e);
    };

    // Remove onClick from props to avoid duplicate handlers
    const { ...restProps } = props as Record<string, unknown>;

    // Don't wrap in DrawerClose for submenu triggers
    return (
      <div
        data-slot="drop-drawer-sub-trigger"
        data-inset={inset}
        className={cn(
          "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-popover-foreground outline-hidden select-none hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
          inset && "pl-8",
          className
        )}
        onClick={combinedOnClick}
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
