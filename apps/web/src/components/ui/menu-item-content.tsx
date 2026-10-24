import type { ReactNode } from "react";

// Keep flexible label space separate from the value and the fixed submenu arrow.
// Values of zero are meaningful (for example, a visible-property count).
export function MenuItemContent({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <>
      <div data-slot="menu-item-content" className="flex min-w-0 flex-1 items-center gap-2">
        {children}
      </div>
      {trailing != null ? (
        <span
          data-slot="menu-item-trailing"
          className="min-w-0 max-w-[60%] truncate text-content-secondary"
        >
          {trailing}
        </span>
      ) : null}
    </>
  );
}
