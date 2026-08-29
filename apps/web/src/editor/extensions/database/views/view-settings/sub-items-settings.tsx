import {
  ArrowDownRight,
  Check,
  ChevronDown,
  ChevronRight,
  ListTree,
  Rows3,
  Settings2,
  Trash2,
} from "@/shared/components/icons";
import { useEffect, useState } from "react";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";

import type {
  DatabaseSubItemsDisplay,
  DatabaseSubItemsFilter,
  DatabaseSubItemsProperty,
  DatabaseSubItemsSettings,
} from "../database-view-config";

const displayOptions: Array<{
  label: string;
  value: DatabaseSubItemsDisplay;
}> = [
  { label: "Nested in toggle", value: "nested" },
  { label: "Flattened list", value: "flattened" },
  { label: "Disabled", value: "disabled" },
];

const filterOptions: Array<{
  label: string;
  value: DatabaseSubItemsFilter;
}> = [
  { label: "Parents only", value: "parents-only" },
  { label: "Parents and sub-items", value: "parents-and-sub-items" },
  { label: "Sub-items only", value: "sub-items-only" },
];

const propertyOptions: Array<{
  label: string;
  value: DatabaseSubItemsProperty;
}> = [
  { label: "Sub-item", value: "sub-item" },
  { label: "Parent item", value: "parent-item" },
];

export function SubItemsSettingsSection({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (settings: Partial<DatabaseSubItemsSettings>) => void;
  settings: DatabaseSubItemsSettings;
}) {
  const [draftSettings, setDraftSettings] = useState(settings);

  useEffect(() => {
    setDraftSettings(settings);
  }, [settings]);

  const updateSettings = (patch: Partial<DatabaseSubItemsSettings>) => {
    setDraftSettings((current) => ({ ...current, ...patch }));
    onSettingsChange(patch);
  };

  return (
    <DropDrawerSub
      displayMode="inline"
      id="database-sub-items-settings"
      title="Sub-items"
    >
      <DropDrawerSubTrigger>
        <ListTree />
        <span>Sub-items</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-72 overflow-hidden">
        {draftSettings.enabled ? (
          <EnabledSubItemsSettings
            onSettingsChange={updateSettings}
            settings={draftSettings}
          />
        ) : (
          <EnableSubItemsSettings
            onEnable={() => updateSettings({ enabled: true })}
          />
        )}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

function EnableSubItemsSettings({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="grid gap-3 p-2">
      <div className="text-xs text-muted-foreground">
        Break down items in toggles
      </div>
      <SubItemsPreview />
      <DropDrawerItem
        className="justify-center bg-primary font-medium text-primary-foreground focus:bg-primary-subtle focus:text-primary-foreground"
        onSelect={(event) => {
          event.preventDefault();
          onEnable();
        }}
      >
        Turn on sub-items
      </DropDrawerItem>
    </div>
  );
}

function EnabledSubItemsSettings({
  onSettingsChange,
  settings,
}: {
  onSettingsChange: (settings: Partial<DatabaseSubItemsSettings>) => void;
  settings: DatabaseSubItemsSettings;
}) {
  return (
    <>
      <DropDrawerLabel>Display options</DropDrawerLabel>
      <SettingsSelect
        id="database-sub-items-display"
        icon={<Rows3 />}
        label={getOptionLabel(displayOptions, settings.display)}
        options={displayOptions}
        selected={settings.display}
        onSelect={(display) => onSettingsChange({ display })}
      />
      <div className="mx-2 my-2">
        <SubItemsPreview />
      </div>
      <DropDrawerLabel>Filter options</DropDrawerLabel>
      <SettingsSelect
        id="database-sub-items-filter"
        icon={<ArrowDownRight />}
        label={getOptionLabel(filterOptions, settings.filter)}
        options={filterOptions}
        selected={settings.filter}
        onSelect={(filter) => onSettingsChange({ filter })}
      />
      <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">
        {getFilterDescription(settings.filter)}
      </p>
      <DropDrawerSeparator />
      <DropDrawerSub id="database-sub-items-advanced" title="Advanced settings">
        <DropDrawerSubTrigger>
          <Settings2 />
          <span>Advanced settings</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-80">
          <DropDrawerLabel>
            Choose which relation represents the sub-items.
          </DropDrawerLabel>
          {propertyOptions.map((option) => (
            <DropDrawerItem
              key={option.value}
              onSelect={() => onSettingsChange({ property: option.value })}
            >
              <ArrowDownRight />
              <span>{option.label}</span>
              {settings.property === option.value ? (
                <Check className="ml-auto" />
              ) : null}
            </DropDrawerItem>
          ))}
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerItem
        className="text-destructive focus:text-destructive"
        onSelect={() => onSettingsChange({ enabled: false })}
      >
        <Trash2 />
        <span>Turn off sub-items</span>
      </DropDrawerItem>
    </>
  );
}

function SettingsSelect<Value extends string>({
  id,
  icon,
  label,
  onSelect,
  options,
  selected,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  onSelect: (value: Value) => void;
  options: Array<{ label: string; value: Value }>;
  selected: Value;
}) {
  return (
    <DropDrawerSub id={id} title={label}>
      <DropDrawerSubTrigger>
        {icon}
        <span>{label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent>
        {options.map((option) => (
          <DropDrawerItem
            key={option.value}
            onSelect={() => onSelect(option.value)}
          >
            <span>{option.label}</span>
            {selected === option.value ? <Check className="ml-auto" /> : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

function SubItemsPreview() {
  return (
    <div className="rounded-md border bg-subtle-surface p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <ChevronDown className="size-4 text-muted-foreground" />
        <span>Parent item</span>
      </div>
      <div className="ml-6 mt-2 grid gap-2 text-muted-foreground">
        <div className="flex items-center gap-2">
          <ChevronRight className="size-3.5" />
          <span>Sub-item</span>
        </div>
        <div className="flex items-center gap-2">
          <ChevronRight className="size-3.5" />
          <span>Sub-item</span>
        </div>
      </div>
    </div>
  );
}

function getOptionLabel<Value extends string>(
  options: Array<{ label: string; value: Value }>,
  value: Value,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getFilterDescription(filter: DatabaseSubItemsFilter) {
  if (filter === "parents-and-sub-items") {
    return "Filters are applied to parents and sub-items. Matching rows keep their parent context.";
  }

  if (filter === "sub-items-only") {
    return "Filters are applied to sub-items. Parent rows remain visible as context.";
  }

  return "Filters are applied to parent rows. Their sub-items stay nested underneath.";
}
