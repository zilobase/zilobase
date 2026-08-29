import { ArrowDownUp, Plus } from "@/shared/components/icons";
import { Reorder } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
} from "@/shared/ui/dropdrawer";

import { getNextDatabaseOptionColor } from "../../../core/database-property-types";
import type {
  DatabasePropertyConfig,
  DatabaseSelectOption,
} from "../../../views/model/database-view-config";
import {
  areSameOrderedIds,
  haveSameIds,
  OptionCreateInput,
  OptionEditorSubmenu,
  PropertySettingSubmenu,
  reorderOptionsByIds,
} from "../shared";

export type SelectOptionSortValue =
  | "manual"
  | "alphabetical"
  | "reverse_alphabetical";

const selectOptionSortOptions = [
  { label: "Manual", value: "manual" },
  { label: "Alphabetical", value: "alphabetical" },
  { label: "Reverse alphabetical", value: "reverse_alphabetical" },
] satisfies { label: string; value: SelectOptionSortValue }[];

export function SelectPropertySettings({
  onUpdateConfig,
  options,
  sort,
}: {
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  options: DatabaseSelectOption[];
  sort: SelectOptionSortValue;
}) {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const optionIds = options.map((option) => option.id);
  const [draftOptionIds, setDraftOptionIds] = useState<string[] | null>(null);
  const draftOptionIdsRef = useRef<string[] | null>(null);
  const draftOptionFrameRef = useRef<number | null>(null);
  const renderedOptionIds = draftOptionIds ?? optionIds;
  const renderedOptions = reorderOptionsByIds(options, renderedOptionIds);

  useEffect(() => {
    if (
      draftOptionIds &&
      (areSameOrderedIds(draftOptionIds, optionIds) ||
        !haveSameIds(draftOptionIds, optionIds))
    ) {
      draftOptionIdsRef.current = null;
      setDraftOptionIds(null);
    }
  }, [draftOptionIds, optionIds]);

  const updateOption = (
    optionId: string,
    patch: Partial<DatabaseSelectOption>,
  ) => {
    const nextOptions = options.map((option) =>
      option.id === optionId ? { ...option, ...patch } : option,
    );

    onUpdateConfig({ options: getSortedSelectOptions(nextOptions, sort) });
  };
  const addOption = (name: string) => {
    const nextOptions = [
      ...options,
      {
        color: getNextDatabaseOptionColor(options.length),
        id: crypto.randomUUID(),
        name,
      },
    ];

    onUpdateConfig({ options: getSortedSelectOptions(nextOptions, sort) });
  };
  const updateSort = (selectOptionSort: SelectOptionSortValue) => {
    onUpdateConfig({
      options:
        selectOptionSort === "manual"
          ? options
          : getSortedSelectOptions(options, selectOptionSort),
      selectOptionSort,
    });
  };
  const queueOptionReorder = (nextOptionIds: string[]) => {
    draftOptionIdsRef.current = nextOptionIds;

    if (draftOptionFrameRef.current !== null) {
      return;
    }

    draftOptionFrameRef.current = requestAnimationFrame(() => {
      draftOptionFrameRef.current = null;
      const latestOptionIds = draftOptionIdsRef.current;

      if (!latestOptionIds) {
        return;
      }

      setDraftOptionIds((currentOptionIds) =>
        areSameOrderedIds(currentOptionIds ?? optionIds, latestOptionIds)
          ? currentOptionIds
          : latestOptionIds,
      );
    });
  };
  const commitOptionReorder = () => {
    const nextOptionIds = draftOptionIdsRef.current;

    if (!nextOptionIds) {
      return;
    }

    if (draftOptionFrameRef.current !== null) {
      cancelAnimationFrame(draftOptionFrameRef.current);
      draftOptionFrameRef.current = null;
    }

    draftOptionIdsRef.current = null;
    setDraftOptionIds(nextOptionIds);

    if (areSameOrderedIds(nextOptionIds, optionIds)) {
      setDraftOptionIds(null);
      return;
    }

    onUpdateConfig({
      options: reorderOptionsByIds(options, nextOptionIds),
      selectOptionSort: "manual",
    });
  };

  return (
    <>
      <PropertySettingSubmenu
        icon={<ArrowDownUp />}
        label="Sort"
        onSelect={updateSort}
        options={selectOptionSortOptions}
        selectedValue={sort}
      />
      <DropDrawerSeparator />
      <DropDrawerLabel className="flex items-center justify-between pr-1">
        <span>Options</span>
        <button
          aria-label="Add select option"
          className="-my-1 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={() => setShowCreateInput(true)}
          type="button"
        >
          <Plus className="size-4" />
        </button>
      </DropDrawerLabel>
      {showCreateInput ? (
        <OptionCreateInput
          ariaLabel="New select option name"
          onCancel={() => setShowCreateInput(false)}
          onCreate={(name) => {
            addOption(name);
            setShowCreateInput(false);
          }}
          placeholder="New option"
        />
      ) : null}
      {options.length > 0 ? (
        <Reorder.Group
          as="div"
          axis="y"
          layoutScroll
          values={renderedOptionIds}
          onReorder={queueOptionReorder}
        >
          {renderedOptions.map((option) => (
            <OptionEditorSubmenu
              draggable
              key={option.id}
              onDragEnd={commitOptionReorder}
              onUpdateOption={updateOption}
              option={option}
            />
          ))}
        </Reorder.Group>
      ) : (
        <DropDrawerItem disabled>No options yet</DropDrawerItem>
      )}
    </>
  );
}

export function getSelectOptions(config: unknown) {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as DatabasePropertyConfig).options
      : null;

  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter(
    (option): option is DatabaseSelectOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string",
  );
}

export function getSelectOptionSort(config: unknown): SelectOptionSortValue {
  if (!config || typeof config !== "object" || !("selectOptionSort" in config)) {
    return "manual";
  }

  const selectOptionSort = (config as DatabasePropertyConfig).selectOptionSort;

  return isSelectOptionSortValue(selectOptionSort)
    ? selectOptionSort
    : "manual";
}

function isSelectOptionSortValue(
  value: unknown,
): value is SelectOptionSortValue {
  return (
    value === "manual" ||
    value === "alphabetical" ||
    value === "reverse_alphabetical"
  );
}

function getSortedSelectOptions(
  options: DatabaseSelectOption[],
  sort: SelectOptionSortValue,
) {
  if (sort === "manual") {
    return options;
  }

  const sortedOptions = [...options].sort((firstOption, secondOption) =>
    firstOption.name.localeCompare(secondOption.name, undefined, {
      sensitivity: "base",
    }),
  );

  return sort === "reverse_alphabetical"
    ? sortedOptions.reverse()
    : sortedOptions;
}
