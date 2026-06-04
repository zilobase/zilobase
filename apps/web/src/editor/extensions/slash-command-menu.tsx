import { useEffect, useRef } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

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
                <span className="slash-menu-icon">
                  <Icon />
                </span>
                <span className="min-w-0">
                  <span className="slash-menu-title">{item.title}</span>
                  <span className="slash-menu-description">
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
