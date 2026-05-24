export function DocumentSummary() {
  return (
    <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
      <div className="rounded-md border bg-card p-3">
        <span className="font-medium text-foreground">Slash blocks</span>
        <p>Start a line with / to insert headings, lists, tasks, and more.</p>
      </div>
      <div className="rounded-md border bg-card p-3">
        <span className="font-medium text-foreground">Tasks</span>
        <p>Use nested checklists for plans, specs, and working notes.</p>
      </div>
      <div className="rounded-md border bg-card p-3">
        <span className="font-medium text-foreground">Rich formatting</span>
        <p>Color, align, quote, code, and track live document counts.</p>
      </div>
    </div>
  )
}
