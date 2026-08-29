import type { AgentResultTable as AgentResultTableData } from "@zilobase/features/ai-chat/agent-contract"
import { ArrowUpDownIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, SearchIcon } from "@/shared/components/icons"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

export function AgentResultTable({ table }: { table: AgentResultTableData }) {
  const [filter, setFilter] = useState("")
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" } | null>(null)
  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const filtered = query
      ? table.rows.filter((row) => Object.values(row.cells).some((cell) => cell.toLowerCase().includes(query)))
      : table.rows
    if (!sort) return filtered
    return [...filtered].sort((left, right) => {
      const comparison = (left.cells[sort.columnId] ?? "").localeCompare(
        right.cells[sort.columnId] ?? "",
        undefined,
        { numeric: true, sensitivity: "base" },
      )
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [filter, sort, table.rows])
  const csv = useMemo(() => [
    table.columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) => table.columns.map((column) => csvCell(row.cells[column.id] ?? "")).join(",")),
  ].join("\r\n"), [rows, table.columns])

  const copy = async () => {
    await navigator.clipboard.writeText(csv)
    toast.success("Table copied")
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "ask-ai-results.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="not-prose my-3 overflow-hidden rounded-lg border bg-surface-canvas" aria-label="AI table result">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <div className="relative min-w-40 flex-1">
          <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-content-secondary" />
          <Input aria-label="Filter table" className="h-8 pl-7 text-xs" onChange={(event) => setFilter(event.target.value)} placeholder="Filter rows" value={filter} />
        </div>
        <Button aria-label="Copy table" onClick={() => void copy()} size="icon-sm" variant="ghost"><CopyIcon className="size-3.5" /></Button>
        <Button aria-label="Download table as CSV" onClick={download} size="icon-sm" variant="ghost"><DownloadIcon className="size-3.5" /></Button>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="sticky top-0 bg-surface-muted"><tr>
            {table.columns.map((column) => (
              <th className="border-b px-3 py-2 font-medium" key={column.id}>
                <button className="inline-flex items-center gap-1 hover:text-content-primary" onClick={() => setSort((current) => current?.columnId === column.id ? { columnId: column.id, direction: current.direction === "asc" ? "desc" : "asc" } : { columnId: column.id, direction: "asc" })} type="button">
                  {column.label}<ArrowUpDownIcon className="size-3" />
                </button>
              </th>
            ))}
            <th className="w-8 border-b" />
          </tr></thead>
          <tbody>{rows.map((row) => (
            <tr className="border-b last:border-b-0" key={row.id}>
              {table.columns.map((column) => <td className="max-w-72 truncate px-3 py-2" key={column.id} title={row.cells[column.id] ?? ""}>{row.cells[column.id] ?? ""}</td>)}
              <td className="px-2">{row.pageId ? <a aria-label="Open row" className="text-content-secondary hover:text-content-primary" href={`/p/${encodeURIComponent(row.pageId)}`}><ExternalLinkIcon className="size-3.5" /></a> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="border-t px-3 py-1.5 text-content-secondary text-xs">{rows.length} rows</div>
    </section>
  )
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}
