import { Check } from "@/components/icons";
import type { ReactNode } from "react";

import {
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";

type PropertySettingOption<TValue> = {
  icon?: ReactNode;
  label: string;
  value: TValue;
};

export function PropertySettingSubmenu<TValue extends string | number>({
  icon,
  label,
  onSelect,
  options,
  selectedValue,
}: {
  icon: ReactNode;
  label: string;
  onSelect: (value: TValue) => void;
  options: PropertySettingOption<TValue>[];
  selectedValue: TValue;
}) {
  const selectedOption =
    options.find((option) => option.value === selectedValue) ?? options[0];

  return (
    <DropDrawerSub title={label}>
      <DropDrawerSubTrigger>
        {icon}
        <span className="flex-1">{label}</span>
        <span className="text-muted-foreground">{selectedOption?.label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-64">
        {options.map((option) => (
          <DropDrawerItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault();
              onSelect(option.value);
            }}
          >
            {option.icon ?? null}
            <span>{option.label}</span>
            {option.value === selectedValue ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}
