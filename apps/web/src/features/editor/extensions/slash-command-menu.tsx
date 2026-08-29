import { useEffect, useRef } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"

import type { SlashCommandItem } from "./slash-command"

export function SlashCommandMenu({
  items,
  selectedIndex,
  setSelectedIndex,
  selectItem,
}: {
  items: SlashCommandItem[]
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  selectItem: (index: number) => void
}) {
  const selectedItemRef = useRef<HTMLDivElement | null>(null)
  const selectedItem = items[selectedIndex]

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({
      block: "nearest",
    })
  }, [selectedIndex])

  return (
    <Command
      onValueChange={(value) => {
        const nextIndex = items.findIndex((item) => item.title === value)

        if (nextIndex >= 0) {
          setSelectedIndex(nextIndex)
        }
      }}
      value={selectedItem?.title ?? ""}
    >
      <CommandList>
        <CommandEmpty>No blocks found</CommandEmpty>
        <CommandGroup>
          {items.map((item, index) => {
            const Icon = item.icon

            return (
              <CommandItem
                aria-selected={index === selectedIndex}
                data-selected={index === selectedIndex ? true : undefined}
                key={item.title}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectItem(index)
                }}
                onSelect={() => selectItem(index)}
                ref={index === selectedIndex ? selectedItemRef : undefined}
                value={item.title}
              >
                <Icon className="size-4 text-content-secondary" />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{item.title}</span>
                  <span className="truncate text-xs text-content-secondary">
                    {item.description}
                  </span>
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
