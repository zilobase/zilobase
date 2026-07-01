import * as React from "react"

import { IconSvgPreview } from "@/components/ui/icon-svg-preview"
import { iconColorOptions } from "@/lib/color-tokens"
import { cn } from "@/lib/utils"

export function IconColorGrid({
  className,
  columns = 5,
  content,
  label,
  onSelect,
  preview,
  previewSize = 24,
  viewBox = "0 0 24 24",
}: {
  className?: string
  columns?: number
  content?: string
  label?: string
  onSelect: (colorValue: string, svgElement?: SVGSVGElement) => void
  preview?: React.ReactElement<React.SVGProps<SVGSVGElement>>
  previewSize?: number
  viewBox?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? (
        <p className="px-0.5 text-xs text-muted-foreground">Choose a color</p>
      ) : null}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {iconColorOptions.map((color) => (
          <button
            aria-label={
              label ? `${label} in ${color.name}` : `Icon in ${color.name}`
            }
            className="flex aspect-square size-8 items-center justify-center rounded-md border border-transparent transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            key={color.value}
            onClick={(event) => {
              const svgElement = event.currentTarget.querySelector("svg")

              if (svgElement) {
                onSelect(color.value, svgElement)
              }
            }}
            title={color.name}
            type="button"
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-md shadow-sm/5",
                color.solidClass,
              )}
            >
              {preview ? (
                React.cloneElement(preview, {
                  className: cn(
                    "size-3.5 shrink-0 text-current",
                  ),
                })
              ) : content ? (
                <IconSvgPreview
                  content={content}
                  size={Math.min(previewSize, 14)}
                  viewBox={viewBox}
                />
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
