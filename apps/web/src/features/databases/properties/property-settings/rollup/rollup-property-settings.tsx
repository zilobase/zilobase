import { ArrowUpRight, Check, Sigma, Type } from "@/shared/components/icons";
import type { ReactNode } from "react";

import {
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useDatabase } from "@zilobase/features/databases";

import type { DatabasePropertyConfig } from "../../../views/model/database-view-config";
import {
  getRollupCalculationsForType,
  getRollupConfig,
  getRollupConfigUpdate,
  getRollupNumberPropertyConfig,
  getValidRollupCalculation,
  rollupCountCalculations,
  rollupDateCalculations,
  rollupPercentCalculations,
  rollupShowCalculations,
  type DatabaseRollupConfig,
} from "../../rollup/rollup-config";
import { getRollupRelationProperty } from "../../rollup/rollup-engine";
import { NumberPropertySettings } from "../number";
import { getRelationConfig } from "../relation";
import { PropertySettingSubmenu } from "../shared";

type RollupCalculation = NonNullable<DatabaseRollupConfig["calculation"]>;
type RollupCalculationOption = {
  label: string;
  value: RollupCalculation;
};

export function DatabaseRollupPropertySettings({
  config,
  databaseId,
  onUpdateConfig,
  surface = "menu",
}: {
  config?: unknown;
  databaseId: string;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  surface?: "menu" | "popover";
}) {
  const rollupConfig = getRollupConfig(config);
  const { data: currentDatabasePayload, isLoading: isLoadingCurrentDatabase } =
    useDatabase(databaseId, { schemaOnly: true });
  const relationProperties =
    currentDatabasePayload?.properties.filter(
      (property) => property.property.type === "relation",
    ) ?? [];
  const selectedRelationProperty =
    getRollupRelationProperty(
      relationProperties,
      rollupConfig.relationPropertyId,
    ) ?? relationProperties[0];
  const relationConfig = getRelationConfig(
    selectedRelationProperty?.property.config,
  );
  const { data: relatedDatabasePayload, isLoading: isLoadingRelatedDatabase } =
    useDatabase(relationConfig.relatedDatabaseId, { schemaOnly: true });
  const targetProperties = [
    { id: "name", name: "Name", type: "text" },
    ...(relatedDatabasePayload?.properties ?? [])
      .filter((property) => property.property.type !== "rollup")
      .map((property) => ({
        id: property.property.id,
        name: property.property.name,
        type: property.property.type,
      })),
  ];
  const selectedTargetProperty = targetProperties.find(
    (property) => property.id === rollupConfig.targetPropertyId,
  );
  const effectiveTargetProperty = selectedTargetProperty ?? targetProperties[0];
  const selectedTargetType = effectiveTargetProperty?.type ?? "text";
  const calculation = getValidRollupCalculation(
    rollupConfig.calculation,
    selectedTargetType,
  );
  const calculationOptions = getRollupCalculationsForType(selectedTargetType);
  const updateRollupConfig = (patch: Partial<DatabaseRollupConfig>) => {
    onUpdateConfig(
      getRollupConfigUpdate(
        config,
        {
          relationPropertyId: selectedRelationProperty?.id,
          targetPropertyId: effectiveTargetProperty?.id,
        },
        patch,
      ),
    );
  };
  const relationOptions = relationProperties.map((property) => ({
    label: property.property.name,
    value: property.id,
  }));
  const targetOptions = targetProperties.map((property) => ({
    label: property.name,
    value: property.id,
  }));
  const selectRelation = (relationPropertyId: string) => {
    const nextRelationProperty = relationProperties.find(
      (property) => property.id === relationPropertyId,
    );

    updateRollupConfig({
      calculation: "show_original",
      relationPropertyId,
      targetPropertyId:
        nextRelationProperty?.id === rollupConfig.relationPropertyId
          ? rollupConfig.targetPropertyId
          : undefined,
    });
  };
  const selectTarget = (targetPropertyId: string) => {
    const nextTarget = targetProperties.find(
      (property) => property.id === targetPropertyId,
    );

    updateRollupConfig({
      calculation: getValidRollupCalculation(
        rollupConfig.calculation,
        nextTarget?.type ?? "text",
      ),
      targetPropertyId,
    });
  };

  if (surface === "popover") {
    if (isLoadingCurrentDatabase) {
      return <RollupPopoverMessage>Loading relations...</RollupPopoverMessage>;
    }

    if (relationProperties.length === 0) {
      return (
        <RollupPopoverMessage>
          Add a relation property first.
        </RollupPopoverMessage>
      );
    }

    return (
      <div className="flex flex-col gap-2 p-1">
        <RollupSelect
          icon={<ArrowUpRight />}
          label="Relation"
          onValueChange={selectRelation}
          options={relationOptions}
          value={selectedRelationProperty?.id ?? ""}
        />
        <RollupSelect
          icon={<Type />}
          label="Target property"
          onValueChange={selectTarget}
          options={targetOptions}
          value={effectiveTargetProperty?.id ?? ""}
        />
        <RollupStateMessage
          isLoadingRelatedDatabase={isLoadingRelatedDatabase}
          relatedDatabaseId={relationConfig.relatedDatabaseId}
          selectedRelation={Boolean(selectedRelationProperty)}
          targetPropertyCount={targetProperties.length}
          surface="popover"
        />
        <RollupCalculationSelect
          calculation={calculation}
          onValueChange={(nextCalculation) =>
            updateRollupConfig({ calculation: nextCalculation })
          }
          options={calculationOptions}
        />
      </div>
    );
  }

  if (isLoadingCurrentDatabase) {
    return <DropDrawerItem disabled>Loading relations...</DropDrawerItem>;
  }

  if (relationProperties.length === 0) {
    return (
      <DropDrawerItem disabled>Add a relation property first.</DropDrawerItem>
    );
  }

  return (
    <>
      <PropertySettingSubmenu
        icon={<ArrowUpRight />}
        label="Relation"
        onSelect={selectRelation}
        options={relationOptions}
        selectedValue={selectedRelationProperty?.id ?? ""}
      />
      <PropertySettingSubmenu
        icon={<Type />}
        label="Target property"
        onSelect={selectTarget}
        options={targetOptions}
        selectedValue={effectiveTargetProperty?.id ?? ""}
      />
      <RollupStateMessage
        isLoadingRelatedDatabase={isLoadingRelatedDatabase}
        relatedDatabaseId={relationConfig.relatedDatabaseId}
        selectedRelation={Boolean(selectedRelationProperty)}
        targetPropertyCount={targetProperties.length}
        surface="menu"
      />
      <RollupCalculationSubmenu
        calculation={calculation}
        onSelect={(nextCalculation) =>
          updateRollupConfig({ calculation: nextCalculation })
        }
        options={calculationOptions}
      />
      {selectedTargetType === "number" ? (
        <>
          <DropDrawerSeparator />
          <NumberPropertySettings
            config={getRollupNumberPropertyConfig(config)}
            onUpdateConfig={updateRollupConfig}
          />
        </>
      ) : null}
    </>
  );
}

function RollupStateMessage({
  isLoadingRelatedDatabase,
  relatedDatabaseId,
  selectedRelation,
  surface,
  targetPropertyCount,
}: {
  isLoadingRelatedDatabase: boolean;
  relatedDatabaseId?: string;
  selectedRelation: boolean;
  surface: "menu" | "popover";
  targetPropertyCount: number;
}) {
  const message = !selectedRelation
    ? "Select a relation."
    : !relatedDatabaseId
      ? "Configure relation first."
      : isLoadingRelatedDatabase
        ? "Loading properties..."
        : targetPropertyCount === 0
          ? "No properties available."
          : null;

  if (!message) {
    return null;
  }

  return surface === "popover" ? (
    <RollupPopoverMessage>{message}</RollupPopoverMessage>
  ) : (
    <DropDrawerItem disabled>{message}</DropDrawerItem>
  );
}

function RollupSelect<TValue extends string>({
  icon,
  label,
  onValueChange,
  options,
  value,
}: {
  icon: ReactNode;
  label: string;
  onValueChange: (value: TValue) => void;
  options: { label: string; value: TValue }[];
  value: TValue;
}) {
  return (
    <label className="grid gap-1.5 px-1.5 py-1 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {label}
      </span>
      <Select
        onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
        value={value}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function RollupPopoverMessage({ children }: { children: ReactNode }) {
  return (
    <div className="px-1.5 py-1 text-sm text-muted-foreground">{children}</div>
  );
}

function RollupCalculationSelect({
  calculation,
  onValueChange,
  options,
}: {
  calculation: DatabaseRollupConfig["calculation"];
  onValueChange: (value: RollupCalculation) => void;
  options: RollupCalculationOption[];
}) {
  const optionGroups = groupCalculationOptions(options);

  return (
    <label className="grid gap-1.5 px-1.5 py-1 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
        <Sigma />
        Calculate
      </span>
      <Select
        onValueChange={(nextValue) =>
          onValueChange(nextValue as RollupCalculation)
        }
        value={calculation ?? options[0]?.value}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionGroups.ungrouped.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          {optionGroups.groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function RollupCalculationSubmenu({
  calculation,
  onSelect,
  options,
}: {
  calculation: DatabaseRollupConfig["calculation"];
  onSelect: (value: RollupCalculation) => void;
  options: RollupCalculationOption[];
}) {
  const selectedOption =
    options.find((option) => option.value === calculation) ?? options[0];
  const optionGroups = groupCalculationOptions(options);

  return (
    <DropDrawerSub title="Calculate">
      <DropDrawerSubTrigger>
        <Sigma />
        <span className="flex-1">Calculate</span>
        <span className="text-muted-foreground">{selectedOption?.label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-64">
        {optionGroups.ungrouped.map((option) => (
          <RollupCalculationItem
            key={option.value}
            calculation={calculation}
            onSelect={() => onSelect(option.value)}
            option={option}
          />
        ))}
        {optionGroups.groups.map((group) => (
          <RollupCalculationGroupSubmenu
            key={group.label}
            calculation={calculation}
            label={group.label}
            onSelect={onSelect}
            options={group.options}
          />
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

function RollupCalculationGroupSubmenu({
  calculation,
  label,
  onSelect,
  options,
}: {
  calculation: DatabaseRollupConfig["calculation"];
  label: string;
  onSelect: (value: RollupCalculation) => void;
  options: RollupCalculationOption[];
}) {
  return (
    <DropDrawerSub title={label}>
      <DropDrawerSubTrigger>
        <span>{label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-64">
        {options.map((option) => (
          <RollupCalculationItem
            key={option.value}
            calculation={calculation}
            onSelect={() => onSelect(option.value)}
            option={option}
          />
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

function RollupCalculationItem({
  calculation,
  onSelect,
  option,
}: {
  calculation: DatabaseRollupConfig["calculation"];
  onSelect: () => void;
  option: RollupCalculationOption;
}) {
  return (
    <DropDrawerItem
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <span>{option.label}</span>
      {option.value === calculation ? <Check className="ml-auto" /> : null}
    </DropDrawerItem>
  );
}

function groupCalculationOptions(options: RollupCalculationOption[]) {
  const visibleValues = new Set(options.map((option) => option.value));
  const showOptions = rollupShowCalculations.filter((option) =>
    visibleValues.has(option.value),
  );
  const countOptions = rollupCountCalculations.filter((option) =>
    visibleValues.has(option.value),
  );
  const percentOptions = rollupPercentCalculations.filter((option) =>
    visibleValues.has(option.value),
  );
  const dateOptions = rollupDateCalculations.filter((option) =>
    visibleValues.has(option.value),
  );
  const groupedValues = new Set<RollupCalculation>(
    [...showOptions, ...countOptions, ...percentOptions, ...dateOptions].map(
      (option) => option.value,
    ),
  );
  const otherOptions = options.filter(
    (option) => !groupedValues.has(option.value),
  );

  return {
    groups: [
      { label: "Count", options: countOptions },
      { label: "Percent", options: percentOptions },
      { label: "Date", options: dateOptions },
    ].filter((group) => group.options.length > 0),
    ungrouped: [...showOptions, ...otherOptions],
  };
}
