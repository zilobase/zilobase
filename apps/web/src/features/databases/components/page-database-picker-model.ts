export type PageDatabasePickerSearchOption = {
  label: string
  searchText?: string
  value: string
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
}

export function filterPageDatabasePickerOptions<
  TOption extends PageDatabasePickerSearchOption,
>(options: TOption[], query: string) {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) return options

  return options
    .map((option, index) => {
      const label = normalizeSearchText(option.label)
      const searchText = normalizeSearchText(
        option.searchText ?? option.label,
      )
      const matchIndex = searchText.indexOf(normalizedQuery)

      if (matchIndex < 0) return null

      const rank = label.startsWith(normalizedQuery)
        ? 0
        : searchText
            .split(/\s+/)
            .some((word) => word.startsWith(normalizedQuery))
          ? 1
          : 2

      return { index, matchIndex, option, rank }
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        left.matchIndex - right.matchIndex ||
        left.index - right.index,
    )
    .map((match) => match.option)
}
