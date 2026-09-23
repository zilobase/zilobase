import {
  useDeferredValue,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Loader2 } from "@/shared/components/icons"
import { cn } from "@/shared/lib/utils"
import {
  filterPageDatabasePickerOptions,
  type PageDatabasePickerSearchOption,
} from "./page-database-picker-model"

export type PageDatabasePickerOption = PageDatabasePickerSearchOption & {
  description?: string
  disabled?: boolean
  icon?: ReactNode
}

export function PageDatabasePicker<
  TOption extends PageDatabasePickerOption,
>({
  ariaLabel,
  autoFocus = true,
  className,
  emptyMessage,
  filterOptions = true,
  heading,
  isLoading = false,
  isSearching = false,
  loadingMessage,
  onQueryChange,
  onSelect,
  options,
  placeholder,
  query: controlledQuery,
  selectedValues = [],
  trailingContent,
}: {
  ariaLabel: string
  autoFocus?: boolean
  className?: string
  emptyMessage: string
  filterOptions?: boolean
  heading?: string
  isLoading?: boolean
  isSearching?: boolean
  loadingMessage: string
  onQueryChange?: (query: string) => void
  onSelect: (option: TOption) => void
  options: TOption[]
  placeholder: string
  query?: string
  selectedValues?: string[]
  trailingContent?: ReactNode
}) {
  const [internalQuery, setInternalQuery] = useState("")
  const query = controlledQuery ?? internalQuery
  const deferredQuery = useDeferredValue(query)
  const displayedOptions = useMemo(
    () =>
      filterOptions
        ? filterPageDatabasePickerOptions(options, deferredQuery)
        : options,
    [deferredQuery, filterOptions, options],
  )
  const selected = useMemo(() => new Set(selectedValues), [selectedValues])
  const updateQuery = (nextQuery: string) => {
    if (controlledQuery === undefined) setInternalQuery(nextQuery)
    onQueryChange?.(nextQuery)
  }

  return (
    <Command
      className={cn("min-h-0 rounded-none bg-transparent", className)}
      shouldFilter={false}
    >
      <div className="relative shrink-0">
        <CommandInput
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          className={isSearching ? "pr-6" : undefined}
          onKeyDown={(event) => event.stopPropagation()}
          onValueChange={updateQuery}
          placeholder={placeholder}
          value={query}
        />
        {isSearching ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-content-secondary" />
        ) : null}
      </div>
      <CommandList className="max-h-[min(22rem,calc(100dvh-8rem))] min-h-0 overscroll-contain">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-content-secondary">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{loadingMessage}</span>
          </div>
        ) : (
          <>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup heading={heading}>
              {displayedOptions.map((option) => (
                <CommandItem
                  data-checked={
                    selected.has(option.value) ? "true" : undefined
                  }
                  disabled={option.disabled}
                  key={option.value}
                  onSelect={() => onSelect(option)}
                  value={option.value}
                >
                  {option.icon ? (
                    <span className="flex size-4 shrink-0 items-center justify-center text-content-secondary [&_svg]:size-4">
                      {option.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-[0.6875rem] text-content-secondary">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {trailingContent}
          </>
        )}
      </CommandList>
    </Command>
  )
}
