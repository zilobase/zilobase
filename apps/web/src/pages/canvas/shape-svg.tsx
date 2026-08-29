import { useMemo } from "react"

import { cn } from "@/shared/lib/utils"

import {
  getRoughShapePaths,
  getStrokeLineDash,
  getStrokeLineCap,
  getSvgViewBox,
} from "./rough-shape"
import type { CanvasShape, CanvasStrokeStyle } from "./types"

export function ShapeSvg({
  className,
  fill,
  height,
  seed,
  shape,
  stroke,
  strokeStyle,
  strokeWidth,
  width,
}: {
  className?: string
  fill: string
  height: number
  seed: number
  shape: CanvasShape
  stroke: string
  strokeStyle: CanvasStrokeStyle
  strokeWidth: number
  width: number
}) {
  const paths = useMemo(
    () =>
      getRoughShapePaths({
        fill,
        height,
        seed,
        shape,
        stroke,
        strokeWidth,
        width,
      }),
    [
      fill,
      height,
      seed,
      shape,
      stroke,
      strokeStyle,
      strokeWidth,
      width,
    ],
  )
  const strokeDasharray = useMemo(
    () => getStrokeLineDash(strokeStyle, strokeWidth)?.join(" "),
    [strokeStyle, strokeWidth],
  )

  return (
    <svg
      className={cn("h-full w-full overflow-visible", className)}
      fill="none"
      preserveAspectRatio="none"
      viewBox={getSvgViewBox(width, height)}
    >
      {paths.map((path, index) => (
        <path
          d={path.d}
          fill={path.fill ?? "none"}
          key={`${seed}-${shape}-${index}`}
          stroke={path.stroke}
          strokeDasharray={path.stroke !== "none" ? strokeDasharray : undefined}
          strokeLinecap={getStrokeLineCap(strokeStyle)}
          strokeLinejoin="round"
          strokeWidth={path.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
