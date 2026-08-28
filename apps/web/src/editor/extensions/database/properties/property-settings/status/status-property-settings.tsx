import { Plus } from "@/components/icons";
import { Reorder } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import {
  DropDrawerLabel,
  DropDrawerSeparator,
} from "@/components/ui/dropdrawer";

import {
  defaultStatusOptions,
  getNextDatabaseOptionColor,
} from "../../../core/database-property-types";
import type {
  DatabasePropertyConfig,
  DatabaseSelectOption,
} from "../../../views/database-view-config";
import {
  areSameOrderedIds,
  haveSameIds,
  OptionCreateInput,
  OptionEditorSubmenu,
  reorderOptionsByIds,
} from "../shared";

export type StatusOption = DatabaseSelectOption & {
  group?: string;
};

export function StatusPropertySettings({
  defaultOptionId,
  onUpdateConfig,
  options,
}: {
  defaultOptionId?: string;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  options: StatusOption[];
}) {
  const groups = [
    {
      name: "To-do",
      options: options.filter(
        (option) => getStatusOptionGroup(option) === "To-do",
      ),
    },
    {
      name: "In progress",
      options: options.filter(
        (option) => getStatusOptionGroup(option) === "In progress",
      ),
    },
    {
      name: "Complete",
      options: options.filter(
        (option) => getStatusOptionGroup(option) === "Complete",
      ),
    },
  ];
  const resolvedDefaultOptionId = defaultOptionId ?? options[0]?.id;
  const [creatingGroupName, setCreatingGroupName] = useState<string | null>(
    null,
  );
  const [draftGroupOptionIdsByName, setDraftGroupOptionIdsByName] = useState<
    Record<string, string[]>
  >({});
  const draftGroupOptionIdsByNameRef = useRef<Record<string, string[]>>({});
  const draftGroupOptionFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const nextDrafts = { ...draftGroupOptionIdsByNameRef.current };
    let changed = false;

    for (const group of groups) {
      const draftOptionIds = nextDrafts[group.name];
      const groupOptionIds = group.options.map((option) => option.id);

      if (
        draftOptionIds &&
        (areSameOrderedIds(draftOptionIds, groupOptionIds) ||
          !haveSameIds(draftOptionIds, groupOptionIds))
      ) {
        delete nextDrafts[group.name];
        changed = true;
      }
    }

    if (changed) {
      draftGroupOptionIdsByNameRef.current = nextDrafts;
      setDraftGroupOptionIdsByName(nextDrafts);
    }
  }, [options]);

  const updateOption = (optionId: string, patch: Partial<StatusOption>) => {
    onUpdateConfig({
      defaultOptionId: resolvedDefaultOptionId,
      options: options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    });
  };
  const setDefaultOption = (optionId: string) => {
    onUpdateConfig({ defaultOptionId: optionId, options });
  };
  const addOption = (groupName: string, name: string) => {
    onUpdateConfig({
      defaultOptionId: resolvedDefaultOptionId,
      options: [
        ...options,
        {
          color: getNextDatabaseOptionColor(options.length),
          group: groupName,
          id: crypto.randomUUID(),
          name,
        },
      ],
    });
  };
  const setDraftGroupOptionIds = (groupName: string, optionIds: string[]) => {
    draftGroupOptionIdsByNameRef.current = {
      ...draftGroupOptionIdsByNameRef.current,
      [groupName]: optionIds,
    };

    if (draftGroupOptionFrameRef.current !== null) {
      return;
    }

    draftGroupOptionFrameRef.current = requestAnimationFrame(() => {
      draftGroupOptionFrameRef.current = null;
      setDraftGroupOptionIdsByName({
        ...draftGroupOptionIdsByNameRef.current,
      });
    });
  };
  const clearDraftGroupOptionIds = (groupName: string) => {
    if (draftGroupOptionFrameRef.current !== null) {
      cancelAnimationFrame(draftGroupOptionFrameRef.current);
      draftGroupOptionFrameRef.current = null;
    }

    const nextDrafts = { ...draftGroupOptionIdsByNameRef.current };
    delete nextDrafts[groupName];
    draftGroupOptionIdsByNameRef.current = nextDrafts;

    setDraftGroupOptionIdsByName((drafts) => {
      const nextStateDrafts = { ...drafts };
      delete nextStateDrafts[groupName];

      return nextStateDrafts;
    });
  };
  const commitGroupOptionReorder = (
    groupName: string,
    groupOptions: StatusOption[],
  ) => {
    const draftOptionIds = draftGroupOptionIdsByNameRef.current[groupName];

    if (!draftOptionIds) {
      return;
    }

    if (
      areSameOrderedIds(
        draftOptionIds,
        groupOptions.map((option) => option.id),
      )
    ) {
      clearDraftGroupOptionIds(groupName);
      return;
    }

    onUpdateConfig({
      defaultOptionId: resolvedDefaultOptionId,
      options: reorderStatusGroupOptions(options, groupName, draftOptionIds),
    });
  };

  return (
    <>
      {groups.map((group, groupIndex) => {
        const groupOptionIds = group.options.map((option) => option.id);
        const renderedOptionIds =
          draftGroupOptionIdsByName[group.name] ?? groupOptionIds;
        const renderedOptions = reorderOptionsByIds(
          group.options,
          renderedOptionIds,
        );

        return (
          <div key={group.name}>
            {groupIndex > 0 ? <DropDrawerSeparator /> : null}
            <DropDrawerLabel className="flex items-center justify-between pr-1">
              <span>{group.name}</span>
              <button
                aria-label={`Add ${group.name} status`}
                className="-my-1 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setCreatingGroupName(group.name)}
                type="button"
              >
                <Plus className="size-4" />
              </button>
            </DropDrawerLabel>
            <Reorder.Group
              as="div"
              axis="y"
              layoutScroll
              values={renderedOptionIds}
              onReorder={(optionIds) =>
                setDraftGroupOptionIds(group.name, optionIds)
              }
            >
              {renderedOptions.map((option) => (
                <OptionEditorSubmenu
                  defaultOptionId={resolvedDefaultOptionId}
                  draggable
                  key={option.id}
                  onDragEnd={() =>
                    commitGroupOptionReorder(group.name, group.options)
                  }
                  onSetDefaultOption={setDefaultOption}
                  onUpdateOption={updateOption}
                  option={option}
                  showDot
                />
              ))}
            </Reorder.Group>
            {creatingGroupName === group.name ? (
              <OptionCreateInput
                ariaLabel={`New ${group.name} status name`}
                onCancel={() => setCreatingGroupName(null)}
                onCreate={(name) => {
                  addOption(group.name, name);
                  setCreatingGroupName(null);
                }}
                placeholder="New status"
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function getStatusOptions(config: unknown) {
  const options =
    config && typeof config === "object" && "options" in config
      ? (config as DatabasePropertyConfig).options
      : null;

  if (!Array.isArray(options) || options.length === 0) {
    return defaultStatusOptions;
  }

  const validOptions = options.filter(
    (option): option is StatusOption =>
      Boolean(option) &&
      typeof option === "object" &&
      typeof option.id === "string" &&
      typeof option.name === "string",
  );

  return validOptions.length > 0 ? validOptions : defaultStatusOptions;
}

function getStatusOptionGroup(option: StatusOption) {
  return (
    option.group ??
    defaultStatusOptions.find(
      (defaultOption) => defaultOption.name === option.name,
    )?.group ??
    "To-do"
  );
}

function reorderStatusGroupOptions(
  options: StatusOption[],
  groupName: string,
  optionIds: string[],
) {
  const reorderedGroupOptions = reorderOptionsByIds(
    options.filter((option) => getStatusOptionGroup(option) === groupName),
    optionIds,
  );
  let nextGroupIndex = 0;

  return options.map((option) => {
    if (getStatusOptionGroup(option) !== groupName) {
      return option;
    }

    const nextOption = reorderedGroupOptions[nextGroupIndex];
    nextGroupIndex += 1;

    return nextOption ?? option;
  });
}
