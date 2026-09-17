import { AutomationPickerTrigger } from "../automation-picker-controls";
import { actionProperties, propertyActionLabel, actionValuesFromLiteral, actionLiteralFromValues } from "./property-action-model";
import { AutomationPropertyIcon, automationMenuItemClassName, TriggerOptionRow } from "../automation-picker-controls";
import { useState } from "react";
import type { DatabaseAutomationCatalog } from "@zilobase/features/automations";

import { ArrowLeft, ChevronDownIcon, Sparkles, Trash2 } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/shared/ui/command";

import { Popover, PopoverContent } from "@/shared/ui/popover";

import { getColorTokenBadgeClassName } from "@/shared/lib/color-tokens";

import { DatabaseConditionValueControl } from "../../databases/views/components/database-condition-editor";
import { type DatabaseCondition } from "../../databases/views/model/filter-sort-contracts";

import { createNotionActionDraft, NOTION_ACTION_OPTIONS, type NotionActionDraft } from "./notion-action-builder";

export function CompactPropertyActionCard({ catalog, dataSourceId, draft, index, onChange, onMove, onRemove, scheduled }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  draft: NotionActionDraft;
  index: number;
  onChange: (draft: NotionActionDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  scheduled: boolean;
}) {
  const operation = draft.action.type === "edit_trigger_page" ? draft.action.operations[0] : undefined;
  const property = operation ? actionProperties(catalog).find((item) => item.id === operation.propertyId) : undefined;
  return (
    <div className="group/action flex min-h-10 items-center gap-2 rounded-lg border border-stroke-default bg-surface-overlay px-2.5 py-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center text-content-secondary">
        {property ? <AutomationPropertyIcon property={property} /> : <Sparkles className="size-4" />}
      </span>
      <ActionPicker
        catalog={catalog}
        dataSourceId={dataSourceId}
        label={propertyActionLabel(draft, catalog)}
        onSelect={onChange}
        scheduled={scheduled}
        selection={draft}
        variant="card"
      />
      <Button aria-label="Move action up" className="ml-auto text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" disabled={index === 0} onClick={() => onMove(-1)} size="icon-sm" variant="ghost">↑</Button>
      <Button aria-label="Move action down" className="text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" onClick={() => onMove(1)} size="icon-sm" variant="ghost">↓</Button>
      <Button aria-label="Remove action" className="text-content-secondary opacity-0 group-hover/action:opacity-100 focus-visible:opacity-100" onClick={onRemove} size="icon-sm" variant="ghost"><Trash2 /></Button>
    </div>
  );
}

export function ActionPicker({ catalog, dataSourceId, label = "Add action", onSelect, scheduled, selection, variant = "add" }: {
  catalog?: DatabaseAutomationCatalog;
  dataSourceId: string;
  label?: string;
  onSelect: (draft: NotionActionDraft) => void;
  scheduled: boolean;
  selection?: NotionActionDraft;
  variant?: "add" | "card";
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"property" | "root">("root");
  const [propertyConfiguration, setPropertyConfiguration] = useState<{
    property: DatabaseAutomationCatalog["properties"][number];
    values: string[];
  } | null>(null);
  const available = new Map(catalog?.actions.map((item) => [item.type, item]) ?? []);
  const choose = (draft: NotionActionDraft) => {
    onSelect(draft);
    setOpen(false);
    setStep("root");
    setPropertyConfiguration(null);
  };
  const openProperty = (property: DatabaseAutomationCatalog["properties"][number]) => {
    const operation = selection?.action.type === "edit_trigger_page"
      ? selection.action.operations[0]
      : undefined;
    setPropertyConfiguration({
      property,
      values: operation?.propertyId === property.id && operation.value?.type === "literal"
        ? actionValuesFromLiteral(operation.value.value, property.type)
        : [],
    });
    setStep("property");
  };
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("root");
      setPropertyConfiguration(null);
      return;
    }
    const operation = selection?.action.type === "edit_trigger_page"
      ? selection.action.operations[0]
      : undefined;
    const property = operation
      ? actionProperties(catalog).find((item) => item.id === operation.propertyId)
      : undefined;
    if (property) openProperty(property);
  };
  const finishProperty = () => {
    if (!propertyConfiguration?.values.length) return;
    const base = selection?.action.type === "edit_trigger_page"
      ? selection
      : createNotionActionDraft("edit_trigger_page", dataSourceId, catalog);
    if (base.action.type !== "edit_trigger_page") return;
    choose({
      ...base,
      action: {
        ...base.action,
        operations: [{
          mode: "set",
          propertyId: propertyConfiguration.property.id,
          value: {
            type: "literal",
            value: actionLiteralFromValues(propertyConfiguration.values, propertyConfiguration.property.type),
          },
        }],
      },
    });
  };
  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <AutomationPickerTrigger kind="action" variant={variant}><span className="truncate">{label}</span></AutomationPickerTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        {step === "root" ? (
          <Command>
            <CommandInput autoFocus placeholder="Search actions…" />
            <CommandList
              className="max-h-[min(20rem,calc(100dvh-10rem))] touch-pan-y overscroll-contain"
              onWheelCapture={(event) => event.stopPropagation()}
            >
              <CommandEmpty>No actions found.</CommandEmpty>
              <CommandGroup heading="Action">
                {NOTION_ACTION_OPTIONS
                  .filter(({ type }) => type !== "edit_trigger_page")
                  .map(({ label: optionLabel, type }) => {
                    const availability = available.get(type);
                    return (
                      <CommandItem
                        className={automationMenuItemClassName}
                        data-checked={selection?.action.type === type}
                        disabled={availability?.available === false}
                        key={type}
                        onSelect={() => choose(createNotionActionDraft(type, dataSourceId, catalog))}
                        value={optionLabel}
                      >
                        <Sparkles className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{optionLabel}</span>
                        <ChevronDownIcon className="order-last -rotate-90 text-content-secondary" />
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
              {!scheduled ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Edit property">
                    {actionProperties(catalog).map((property) => (
                      <CommandItem
                        className={automationMenuItemClassName}
                        data-checked={selection?.action.type === "edit_trigger_page"
                          && selection.action.operations[0]?.propertyId === property.id}
                        key={property.id}
                        onSelect={() => openProperty(property)}
                        value={`Set ${property.name}`}
                      >
                        <AutomationPropertyIcon property={property} />
                        <span className="min-w-0 flex-1 truncate">{property.name}</span>
                        <ChevronDownIcon className="order-last -rotate-90 text-content-secondary" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        ) : propertyConfiguration ? (
          <div className="min-w-0">
            <div className="flex h-10 items-center gap-1 border-b border-stroke-default px-1.5">
              <Button aria-label="Back to actions" onClick={() => setStep("root")} size="icon-sm" type="button" variant="ghost"><ArrowLeft /></Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">Set {propertyConfiguration.property.name} to</span>
              <Button className="h-7 px-2 text-action-link" disabled={!propertyConfiguration.values.length} onClick={finishProperty} type="button" variant="ghost">Done</Button>
            </div>
            <ActionPropertyValueStep
              catalog={catalog}
              onChange={(values) => setPropertyConfiguration({ ...propertyConfiguration, values })}
              property={propertyConfiguration.property}
              values={propertyConfiguration.values}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ActionPropertyValueStep({ catalog, onChange, property, values }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (values: string[]) => void;
  property: DatabaseAutomationCatalog["properties"][number];
  values: string[];
}) {
  if (["multi_select", "person", "select", "status"].includes(property.type)) {
    const options = property.type === "person"
      ? (catalog?.users ?? []).map(({ id, name }) => ({ id, name }))
      : property.options;
    const selected = new Set(values);
    const multiple = property.type === "multi_select" || property.type === "person";
    return (
      <Command>
        <CommandInput autoFocus placeholder={`Search ${property.name.toLowerCase()}…`} />
        <CommandList className="max-h-[min(20rem,calc(100dvh-10rem))] touch-pan-y overscroll-contain p-1">
          <CommandEmpty>No options found.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => (
              <CommandItem
                className={automationMenuItemClassName}
                key={option.id}
                onSelect={() => onChange(
                  multiple
                    ? selected.has(option.id) ? values.filter((value) => value !== option.id) : [...values, option.id]
                    : selected.has(option.id) ? [] : [option.id]
                )}
                value={option.name}
              >
                <Checkbox checked={selected.has(option.id)} className="pointer-events-none" />
                {"color" in option && typeof option.color === "string"
                  ? <span className={getColorTokenBadgeClassName(option.color)}>{option.name}</span>
                  : <span className="truncate">{option.name}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    );
  }
  if (property.type === "checkbox") {
    return (
      <div className="p-1.5">
        <TriggerOptionRow checked={values[0] === "true"} label="Checked" onCheckedChange={() => onChange(["true"])} />
        <TriggerOptionRow checked={values[0] === "false"} label="Unchecked" onCheckedChange={() => onChange(["false"])} />
      </div>
    );
  }
  const condition: DatabaseCondition = {
    id: `action-${property.id}`,
    label: property.name,
    operator: "is",
    operatorLabel: "Set to",
    propertyId: property.id,
    propertyType: property.type,
    values,
  };
  return (
    <div className="p-2.5">
      <DatabaseConditionValueControl
        condition={condition}
        onUpdate={(patch) => onChange(patch.values ?? values)}
        valueOptions={[]}
      />
    </div>
  );
}
