import type { ReactNode } from "react";
import { Plus } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { PopoverTrigger } from "@/shared/ui/popover";

import { useMemo } from "react";
import type { DatabaseAutomationCatalog } from "@zilobase/features/automations";

import { Checkbox } from "@/shared/ui/checkbox";

import { getColorTokenBadgeClassName } from "@/shared/lib/color-tokens";
import { PageIconDisplay } from "@/features/pages/index";
import { getDatabasePropertyType } from "../databases/schema/property-catalog";

export function TriggerOptionRow({
  checked,
  color,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  color?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useMemo(() => crypto.randomUUID(), []);
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 hover:bg-action-neutral-hover">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <label
        className="flex min-w-0 flex-1 cursor-pointer items-center"
        htmlFor={id}
      >
        {color ? (
          <span className={getColorTokenBadgeClassName(color)}>{label}</span>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </label>
    </div>
  );
}

export function AutomationPropertyIcon({
  property,
}: {
  property: DatabaseAutomationCatalog["properties"][number];
}) {
  if (property.icon) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <PageIconDisplay size="sm" value={property.icon} />
      </span>
    );
  }
  const PropertyIcon = getDatabasePropertyType(property.type).icon;
  return <PropertyIcon className="size-4 shrink-0 text-content-secondary" />;
}

export const automationMenuItemClassName = "min-h-9 px-2 py-2 text-[13px]";

export function AutomationPickerTrigger({
  kind,
  variant,
  icon,
  children,
}: {
  kind: "trigger" | "action";
  variant: "add" | "card";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const adding = variant === "add";
  return (
    <PopoverTrigger asChild>
      <Button
        aria-label={`${adding ? "Add" : "Change"} ${kind}`}
        className={
          adding
            ? "h-10 w-full justify-start border-stroke-default px-3 text-sm"
            : "h-7 min-w-0 flex-1 justify-start px-1.5"
        }
        type="button"
        variant={adding ? "outline" : "ghost"}
      >
        {adding ? <Plus /> : icon}
        {children}
      </Button>
    </PopoverTrigger>
  );
}
