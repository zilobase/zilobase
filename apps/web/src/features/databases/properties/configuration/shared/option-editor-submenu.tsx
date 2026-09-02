import { Check, Flag, GripVertical, Trash2 } from "@/shared/components/icons";
import { Reorder, useDragControls } from "framer-motion";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";
import { Input } from "@/shared/ui/input";
import {
  colorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
  getColorTokenValue,
} from "@/shared/lib/color-tokens";

import type { DatabaseSelectOption } from "../../../views/model/database-view-config";

export function OptionEditorSubmenu({
  defaultOptionId,
  deleteDisabled = false,
  draggable = false,
  onDeleteOption,
  onDragEnd,
  onSetDefaultOption,
  onUpdateOption,
  option,
  showDot = false,
}: {
  defaultOptionId?: string;
  deleteDisabled?: boolean;
  draggable?: boolean;
  onDeleteOption?: (optionId: string) => void;
  onDragEnd?: () => void;
  onSetDefaultOption?: (optionId: string) => void;
  onUpdateOption: (
    optionId: string,
    patch: Partial<DatabaseSelectOption>,
  ) => void;
  option: DatabaseSelectOption;
  showDot?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const dragControls = useDragControls();
  const content = (<>
    <DropDrawerSub title={option.name}>
      <DropDrawerSubTrigger>
        <span
          aria-label={`Drag ${option.name} option`}
          className="inline-flex size-4 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          onPointerDown={(event) => {
            if (!draggable) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            dragControls.start(event);
          }}
          role="button"
          tabIndex={-1}
        >
          <GripVertical />
        </span>
        <span className={getColorTokenBadgeClassName(option.color)}>
          {showDot ? (
            <span
              aria-hidden="true"
              className={getColorTokenDotClassName(option.color)}
            />
          ) : null}
          {option.name}
        </span>
        {option.id === defaultOptionId ? (
          <DropDrawerShortcut>DEFAULT</DropDrawerShortcut>
        ) : null}
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-72">
        <div className="px-1.5 py-1">
          <Input
            aria-label={`${option.name} option name`}
            defaultValue={option.name}
            onBlur={(event) => {
              const nextName = event.target.value.trim();

              if (nextName && nextName !== option.name) {
                onUpdateOption(option.id, { name: nextName });
              }
            }}
            onKeyDown={(event) => {
              event.stopPropagation();

              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <DropDrawerItem
          disabled={!onDeleteOption || deleteDisabled}
          onSelect={(event) => {
            event.preventDefault();
            setDeleteDialogOpen(true);
          }}
        >
          <Trash2 />
          <span>Delete</span>
        </DropDrawerItem>
        {onSetDefaultOption ? (
          <DropDrawerItem
            onSelect={(event) => {
              event.preventDefault();
              onSetDefaultOption(option.id);
            }}
          >
            <Flag />
            <span>Set as default</span>
            {option.id === defaultOptionId ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ) : null}
        <DropDrawerSeparator />
        <DropDrawerLabel>Colors</DropDrawerLabel>
        {colorTokens.map((color) => (
          <DropDrawerItem
            key={color.name}
            onSelect={(event) => {
              event.preventDefault();
              onUpdateOption(option.id, {
                color: color.value ?? "default",
              });
            }}
          >
            <span
              aria-hidden="true"
              className={`size-4 rounded-sm border border-stroke-default ${color.swatchClass}`}
            />
            <span>{color.name}</span>
            {getColorTokenValue(option.color) === (color.value ?? "default") ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{option.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This option will be removed from the property. Automations that use
            it will be paused and must be repaired before they can run again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDeleteOption?.(option.id)}
            variant="destructive"
          >
            Delete option
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );

  if (!draggable) {
    return content;
  }

  return (
    <Reorder.Item
      as="div"
      className="rounded-md"
      dragControls={dragControls}
      dragListener={false}
      onDragEnd={onDragEnd}
      value={option.id}
      whileDrag={{ scale: 0.995 }}
    >
      {content}
    </Reorder.Item>
  );
}
