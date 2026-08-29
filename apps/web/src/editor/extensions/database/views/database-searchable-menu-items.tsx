import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react"

import {
  DropDrawerItem,
  DropDrawerSeparator,
} from "@/shared/ui/dropdrawer"
import { Input } from "@/shared/ui/input"

export type DatabaseSearchableMenuOption = {
  icon?: ReactNode
  label: string
  searchText?: string
  value: string
}

export function DatabaseSearchableMenuItems({
  emptyMessage = "No options found.",
  inputAriaLabel,
  inputIcon,
  inputPlaceholder,
  onSelect,
  open,
  options,
  pinSearch = false,
  renderOption,
}: {
  emptyMessage?: string
  inputAriaLabel: string
  inputIcon?: ReactNode
  inputPlaceholder: string
  onSelect?: (value: string) => void
  open?: boolean
  options: DatabaseSearchableMenuOption[]
  pinSearch?: boolean
  renderOption?: (option: DatabaseSearchableMenuOption) => ReactNode
}) {
  const [query, setQuery] = useState("")
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) => {
      const searchText = (option.searchText ?? option.label).toLowerCase()

      return searchText.includes(normalizedQuery)
    })
  }, [options, query])

  useEffect(() => {
    if (open === false) {
      setQuery("")
    }
  }, [open])

  const handleSelect = (value: string) => {
    setQuery("")
    onSelect?.(value)
  }

  const search = (
    <>
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        {inputIcon ? (
          <span className="size-4 shrink-0 text-muted-foreground">
            {inputIcon}
          </span>
        ) : null}
        <Input
          aria-label={inputAriaLabel}
          className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={inputPlaceholder}
          value={query}
        />
      </div>
      <DropDrawerSeparator />
    </>
  )
  const results =
    filteredOptions.length > 0 ? (
      filteredOptions.map((option) => (
        <Fragment key={option.value}>
          {renderOption ? (
            renderOption(option)
          ) : (
            <DropDrawerItem onSelect={() => handleSelect(option.value)}>
              {option.icon}
              <span>{option.label}</span>
            </DropDrawerItem>
          )}
        </Fragment>
      ))
    ) : (
      <DropDrawerItem disabled>{emptyMessage}</DropDrawerItem>
    )

  if (pinSearch) {
    return (
      <div className="flex h-[min(32rem,calc(100vh-5rem))] max-h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 bg-popover">{search}</div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {results}
        </div>
      </div>
    )
  }

  return (
    <>
      {search}
      {results}
    </>
  )
}
