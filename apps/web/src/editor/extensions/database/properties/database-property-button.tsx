import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function DatabasePropertyButton({
  className,
  editable = true,
  label,
  onClick,
  value,
}: {
  className?: string
  editable?: boolean
  label: string
  onClick?: () => void
  value: string | string[]
}) {
  const resolvedValue = Array.isArray(value)
    ? value.find((item) => item.trim().length > 0) ?? ""
    : value
  const buttonLabel = resolvedValue.trim() || label

  return (
    <div className={cn("flex min-h-8 items-center", className)}>
      <Button
        className={cn(
          "h-7 max-w-full px-2.5",
          !onClick ? "pointer-events-none" : undefined
        )}
        disabled={!editable && Boolean(onClick)}
        onClick={onClick}
        size="sm"
        type="button"
        variant="outline"
      >
        <span className="truncate">{buttonLabel}</span>
      </Button>
    </div>
  )
}
