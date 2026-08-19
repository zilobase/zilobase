import { Button } from "@/components/ui/button"

export function AuthenticatedRouteError({
  resource,
}: {
  resource: "database" | "page"
}) {
  return (
    <main className="flex min-h-[calc(100svh-3rem)] flex-1 items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          This {resource} could not be opened.
        </p>
        <Button onClick={() => window.location.reload()} type="button" variant="outline">
          Try again
        </Button>
      </div>
    </main>
  )
}
