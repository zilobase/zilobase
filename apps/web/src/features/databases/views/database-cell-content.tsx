import type { ReactNode } from "react"

export function DatabaseCellContent({
  children,
  wrapContent = false,
}: {
  children: ReactNode
  wrapContent?: boolean
}) {
  return (
    <div
      className="database-cell-content"
      data-wrap-content={wrapContent ? "true" : "false"}
    >
      {children}
    </div>
  )
}
