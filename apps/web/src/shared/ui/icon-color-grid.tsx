import * as React from "react"

import { IconSvgPreview } from "@/shared/ui/icon-svg-preview"
import { iconColorOptions } from "@/shared/lib/color-tokens"
import { cn } from "@/shared/lib/utils"

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
            className="flex aspect-square size-8 items-center justify-center rounded-md border border-transparent transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-active"
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
            <span className={cn("flex size-7 items-center justify-center", color.textClass)}>
              {preview ? (
                React.cloneElement(preview, {
                  className: cn(
                    "size-6 shrink-0 text-current",
                  ),
                })
              ) : content ? (
                <IconSvgPreview
                  content={content}
                  size={Math.min(previewSize, 24)}
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
