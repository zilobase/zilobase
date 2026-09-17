import { AutomationPickerTrigger } from "../automation-picker-controls";
import { type TriggerPickerSelection, type TriggerDraft, humanize, isChoiceTriggerProperty, triggerConfigurationTitle, operandless, hasRequiredTriggerValues, nextTriggerOperands, triggerOperatorLabel } from "./automation-draft";
import { automationMenuItemClassName, AutomationPropertyIcon, TriggerOptionRow } from "../automation-picker-controls";
import { useState, type ReactNode } from "react";
import type { DatabaseAutomationCatalog } from "@zilobase/features/automations";

import { ArrowLeft, ChevronDownIcon, Clock, Pencil, Plus, X } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/shared/ui/command";
import { Input } from "@/shared/ui/input";

import { Popover, PopoverContent } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { getColorTokenBadgeClassName } from "@/shared/lib/color-tokens";

import { DatabaseConditionValueControl } from "../../databases/views/components/database-condition-editor";
import { type DatabaseCondition } from "../../databases/views/model/filter-sort-contracts";
import type { DatabasePropertyFilterOperator } from "../../databases/views/model/database-view-config";

import { ScheduleEditor } from "./automation-schedule";
import { scheduleTriggerLabel, type ScheduleDraft } from "./schedule-model";

export function TriggerCard({ catalog, onRemove, onSelect, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  onRemove?: () => void;
  onSelect: (selection: TriggerPickerSelection) => void;
  trigger: TriggerDraft;
}) {
  return (
    <div className="group/trigger flex min-h-10 items-center gap-2 rounded-lg border border-stroke-default bg-surface-overlay px-2.5 py-1.5">
      <span className="w-10 shrink-0 text-xs font-medium text-content-secondary">When</span>
      <TriggerPicker
        catalog={catalog}
        label={triggerPickerLabel(trigger, catalog)}
        onSelect={onSelect}
        selection={trigger.type === "page_added"
          ? { type: "page_added" }
          : {
              operands: trigger.operands,
              operator: trigger.operator,
              propertyId: trigger.propertyId,
              type: "property_edited",
            }}
      />
      {onRemove ? <Button aria-label="Remove trigger" className="ml-auto text-content-secondary opacity-0 group-hover/trigger:opacity-100 focus-visible:opacity-100" onClick={onRemove} size="icon-sm" variant="ghost"><X /></Button> : null}
    </div>
  );
}

function AutomationTriggerValueControl({ catalog, onChange, property, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (operands: string[]) => void;
  property?: DatabaseAutomationCatalog["properties"][number];
  trigger: TriggerDraft;
}) {
  if (!property) {
    return (
      <Input
        aria-label="Trigger value"
        onChange={(event) => onChange([event.target.value])}
        placeholder="Value"
        value={trigger.operands[0] ?? ""}
      />
    );
  }
  const condition: DatabaseCondition = {
    id: trigger.id,
    label: property.name,
    operator: trigger.operator as DatabasePropertyFilterOperator,
    operatorLabel: humanize(trigger.operator),
    propertyId: property.id,
    propertyType: property.type,
    values: trigger.operands,
  };
  const valueOptions = property.type === "person"
    ? (catalog?.users ?? []).map(({ id, name }) => ({ label: name, value: id }))
    : property.options.map(({ color, id, name }) => ({ color, label: name, value: id }));
  return (
    <DatabaseConditionValueControl
      condition={condition}
      onUpdate={(patch) => onChange(patch.values ?? trigger.operands)}
      valueOptions={valueOptions}
    />
  );
}

export function ScheduleTriggerCard({ catalog, onChange, onSelect, schedule }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (schedule: ScheduleDraft) => void;
  onSelect: (selection: TriggerPickerSelection) => void;
  schedule: ScheduleDraft;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="overflow-hidden rounded-lg border border-stroke-default bg-surface-overlay">
      <div className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
        <span className="w-10 shrink-0 text-xs font-medium text-content-secondary">When</span>
        <TriggerPicker
          catalog={catalog}
          label={scheduleTriggerLabel(schedule)}
          onSelect={onSelect}
          selection={{ type: "schedule" }}
        />
        <span className="ml-auto" />
        <Button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} schedule trigger`}
          className="text-content-secondary"
          onClick={() => setExpanded((value) => !value)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      </div>
      {expanded ? (
        <div className="border-t border-stroke-default p-2.5">
          <ScheduleEditor onChange={onChange} schedule={schedule} />
        </div>
      ) : null}
    </div>
  );
}

export function TriggerPicker({ catalog, label, onSelect, selection, variant = "card" }: {
  catalog?: DatabaseAutomationCatalog;
  label: ReactNode;
  onSelect: (selection: TriggerPickerSelection) => void;
  selection?: TriggerPickerSelection;
  variant?: "add" | "card";
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"operator" | "root" | "value">("root");
  const [configuration, setConfiguration] = useState<TriggerDraft | null>(null);
  const choose = (next: TriggerPickerSelection) => {
    onSelect(next);
    setOpen(false);
    setStep("root");
    setConfiguration(null);
  };
  const openProperty = (property: DatabaseAutomationCatalog["properties"][number]) => {
    const isCurrentProperty = selection?.type === "property_edited" && selection.propertyId === property.id;
    const defaultOperator = property.operators[0] ?? "was_edited";
    const next: TriggerDraft = {
      id: crypto.randomUUID(),
      operands: isCurrentProperty ? selection.operands ?? [] : [],
      operator: isCurrentProperty
        ? selection.operator ?? defaultOperator
        : defaultOperator,
      propertyId: property.id,
      type: "property_edited",
    };
    setConfiguration(next);
    setStep(isChoiceTriggerProperty(property.type) ? "value" : "operator");
  };
  const finishConfiguration = () => {
    if (!configuration || !configuredProperty) return;
    const normalizeAnyChoice = isChoiceTriggerProperty(configuredProperty.type)
      && configuration.operator === "was_edited";
    choose({
      operands: normalizeAnyChoice
        ? configuredProperty.options.map((option) => option.id)
        : configuration.operands,
      operator: normalizeAnyChoice
        ? configuredProperty.type === "multi_select" ? "contains" : "is"
        : configuration.operator,
      propertyId: configuration.propertyId,
      type: "property_edited",
    });
  };
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep("root");
      setConfiguration(null);
      return;
    }
    if (selection?.type !== "property_edited" || selection.propertyId === "any") return;
    const property = catalog?.properties.find((item) => item.id === selection.propertyId);
    if (property) openProperty(property);
  };

  const configuredProperty = configuration
    ? catalog?.properties.find((item) => item.id === configuration.propertyId)
    : undefined;
  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <AutomationPickerTrigger kind="trigger" variant={variant} icon={triggerPickerIcon(selection)}><span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">{label}</span></AutomationPickerTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        {step === "root" ? (
          <TriggerTypeMenu catalog={catalog} selection={selection} onSelect={choose} onProperty={openProperty} />
        ) : configuration && configuredProperty ? (
          <div className="min-w-0">
            <div className="flex h-10 items-center gap-1 border-b border-stroke-default px-1.5">
              <Button
                aria-label="Back to triggers"
                onClick={() => setStep(step === "value" && !isChoiceTriggerProperty(configuredProperty.type) ? "operator" : "root")}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ArrowLeft />
              </Button>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {step === "operator"
                  ? configuredProperty.name
                  : triggerConfigurationTitle(configuration, configuredProperty)}
              </span>
              {step === "value" ? (
                <Button
                  className="h-7 px-2 text-action-link"
                  disabled={!operandless.has(configuration.operator) && !hasRequiredTriggerValues(configuration)}
                  onClick={finishConfiguration}
                  type="button"
                  variant="ghost"
                >
                  Done
                </Button>
              ) : null}
            </div>
            {step === "operator" ? (
              <Command>
                <CommandList className="max-h-[min(20rem,calc(100dvh-10rem))] p-1">
                  <CommandGroup heading="Run when">
                    {configuredProperty.operators.map((operator) => (
                      <CommandItem
                        className={automationMenuItemClassName}
                        data-checked={configuration.operator === operator}
                        key={operator}
                        onSelect={() => {
                          const next = {
                            ...configuration,
                            operands: nextTriggerOperands(configuration, operator, configuredProperty.type),
                            operator,
                          };
                          setConfiguration(next);
                          if (operandless.has(operator)) {
                            choose({
                              operands: [],
                              operator,
                              propertyId: configuredProperty.id,
                              type: "property_edited",
                            });
                          } else {
                            setStep("value");
                          }
                        }}
                        value={`${configuredProperty.name} ${humanize(operator)}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{triggerOperatorLabel(operator)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            ) : (
              <TriggerConfigurationValueStep
                catalog={catalog}
                onChange={setConfiguration}
                property={configuredProperty}
                trigger={configuration}
              />
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function TriggerConfigurationValueStep({ catalog, onChange, property, trigger }: {
  catalog?: DatabaseAutomationCatalog;
  onChange: (trigger: TriggerDraft) => void;
  property: DatabaseAutomationCatalog["properties"][number];
  trigger: TriggerDraft;
}) {
  if (isChoiceTriggerProperty(property.type)) {
    const allOptionIds = property.options.map((option) => option.id);
    const anyOption = trigger.operator === "was_edited";
    const effectiveOperands = anyOption ? allOptionIds : trigger.operands;
    const selected = new Set(effectiveOperands);
    const allSelected = allOptionIds.length > 0 && allOptionIds.every((id) => selected.has(id));
    return (
      <div className="max-h-[min(20rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain p-1.5">
        <TriggerOptionRow
          checked={anyOption || allSelected}
          label="Any option"
          onCheckedChange={(checked) => {
            onChange({
              ...trigger,
              operands: checked ? allOptionIds : [],
              operator: property.type === "multi_select" ? "contains" : "is",
            });
          }}
        />
        <div className="my-1 h-px bg-stroke-default" />
        {property.options.map((option) => (
          <TriggerOptionRow
            checked={selected.has(option.id)}
            color={option.color}
            key={option.id}
            label={option.name}
            onCheckedChange={(checked) => {
              const operands = checked
                ? [...effectiveOperands.filter((value) => value !== option.id), option.id]
                : effectiveOperands.filter((value) => value !== option.id);
              onChange({
                ...trigger,
                operands,
                operator: operands.length === 0
                  ? "was_edited"
                  : property.type === "multi_select" ? "contains" : "is",
              });
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="p-2.5">
      <AutomationTriggerValueControl
        catalog={catalog}
        onChange={(operands) => onChange({ ...trigger, operands })}
        property={property}
        trigger={trigger}
      />
    </div>
  );
}

function triggerPickerIcon(selection: TriggerPickerSelection | undefined) {
  if (selection?.type === "page_added") return <Plus />;
  if (selection?.type === "schedule") return <Clock />;
  if (selection?.type === "property_edited" && selection.propertyId !== "any") return null;
  return <Pencil />;
}

function triggerPickerLabel(trigger: TriggerDraft, catalog?: DatabaseAutomationCatalog) {
  if (trigger.type === "page_added") return "Page added";
  if (trigger.propertyId === "any") return "Any property edited";
  const property = catalog?.properties.find((item) => item.id === trigger.propertyId);
  const propertyName = property?.name ?? "Property";
  const propertyBadge = (
    <span className="flex max-w-32 shrink-0 items-center gap-1 rounded-md bg-surface-subtle px-1.5 py-0.5 text-xs font-medium text-content-primary">
      {property ? <AutomationPropertyIcon property={property} /> : <Pencil className="size-3.5 shrink-0 text-content-secondary" />}
      <span className="truncate">{propertyName}</span>
    </span>
  );
  if (trigger.operator === "was_edited") return <>{propertyBadge}<span className="shrink-0">edited</span></>;
  const options = trigger.operands.map((operand) => {
    const option = property?.options.find((item) => item.id === operand);
    return { color: option?.color, label: option?.name ?? operand, value: operand };
  }).filter(({ label }) => Boolean(label));
  return (
    <>
      {propertyBadge}
      <span className="shrink-0">{triggerOperatorLabel(trigger.operator).toLowerCase()}</span>
      {options.map((option) => option.color ? (
        <span className={cn("max-w-32 shrink-0 truncate", getColorTokenBadgeClassName(option.color))} key={option.value}>
          {option.label}
        </span>
      ) : (
        <span className="max-w-32 shrink-0 truncate rounded-md bg-surface-subtle px-1.5 py-0.5 text-xs" key={option.value}>
          {option.label}
        </span>
      ))}
    </>
  );
}

function TriggerTypeMenu({ catalog, selection, onSelect, onProperty }: { catalog?: DatabaseAutomationCatalog; selection?: TriggerPickerSelection; onSelect: (selection: TriggerPickerSelection) => void; onProperty: (property: DatabaseAutomationCatalog["properties"][number]) => void }) {
  const selectedPropertyId = selection?.type === "property_edited" ? selection.propertyId : null;
  return (<Command>
            <CommandInput autoFocus placeholder="Search triggers…" />
            <CommandList
              className="max-h-[min(20rem,calc(100dvh-10rem))] touch-pan-y overscroll-contain"
              onWheelCapture={(event) => event.stopPropagation()}
            >
              <CommandEmpty>No triggers found.</CommandEmpty>
              <CommandGroup heading="Event">
                <CommandItem className={automationMenuItemClassName} data-checked={selection?.type === "page_added"} onSelect={() => onSelect({ type: "page_added" })} value="Page added">
                  <Plus />Page added
                </CommandItem>
                <CommandItem className={automationMenuItemClassName} data-checked={selection?.type === "schedule"} onSelect={() => onSelect({ type: "schedule" })} value="Every schedule">
                  <Clock />Every…
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Property edited">
                <CommandItem className={automationMenuItemClassName} data-checked={selectedPropertyId === "any"} onSelect={() => onSelect({ propertyId: "any", type: "property_edited" })} value="Any property edited">
                  <Pencil />Any property
                </CommandItem>
                {(catalog?.properties ?? []).map((property) => (
                  <CommandItem
                    className={automationMenuItemClassName}
                    data-checked={selectedPropertyId === property.id}
                    key={property.id}
                    onSelect={() => onProperty(property)}
                    value={`${property.name} property edited`}
                  >
                    <AutomationPropertyIcon property={property} />
                    <span className="min-w-0 flex-1 truncate">{property.name}</span>
                    <ChevronDownIcon className="order-last -rotate-90 text-content-secondary" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>);
}
