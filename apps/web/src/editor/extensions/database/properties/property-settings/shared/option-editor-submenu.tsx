import { Check, Flag, GripVertical, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import {
  colorTokens,
  getColorTokenBadgeClassName,
  getColorTokenDotClassName,
  getColorTokenValue,
} from "@/lib/color-tokens";

import type { DatabaseSelectOption } from "../../../views/database-view-config";

export function OptionEditorSubmenu({
  defaultOptionId,
  draggable = false,
  onDragEnd,
  onSetDefaultOption,
  onUpdateOption,
  option,
  showDot = false,
}: {
  defaultOptionId?: string;
  draggable?: boolean;
  onDragEnd?: () => void;
  onSetDefaultOption?: (optionId: string) => void;
  onUpdateOption: (
    optionId: string,
    patch: Partial<DatabaseSelectOption>,
  ) => void;
  option: DatabaseSelectOption;
  showDot?: boolean;
}) {
  const dragControls = useDragControls();
  const content = (
    <DropDrawerSub>
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
        <DropDrawerItem disabled>
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
              className={`size-4 rounded-sm border border-foreground/10 ${color.backgroundClass}`}
            />
            <span>{color.name}</span>
            {getColorTokenValue(option.color) === (color.value ?? "default") ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
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
