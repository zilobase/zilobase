import { defaultCanvasSloppiness } from "./constants"
import type { CanvasShape, CanvasSloppiness, CanvasStrokeStyle } from "./types"

const sloppinessOptions: Record<
  CanvasSloppiness,
  {
    bowing: number
    controlJitter: number
    pointJitter: number
  }
> = {
  architect: {
    bowing: 0.18,
    controlJitter: 0.32,
    pointJitter: 0.14,
  },
  artist: {
    bowing: 0.32,
    controlJitter: 0.55,
    pointJitter: 0.24,
  },
  cartoonist: {
    bowing: 0.48,
    controlJitter: 0.82,
    pointJitter: 0.34,
  },
}

type PathPoint = {
  x: number
  y: number
}

type ShapePath = {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

type StrokeContext = {
  bowing: number
  controlJitter: number
  pointJitter: number
  random: () => number
  strokeWidth: number
}

export function getRoughShapePaths({
  fill,
  height,
  seed,
  shape,
  stroke,
  strokeWidth,
  width,
}: {
  fill: string
  height: number
  seed: number
  shape: CanvasShape
  stroke: string
  strokeWidth: number
  width: number
}) {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const inset = Math.max(2, strokeWidth / 2 + 1)
  const contentWidth = Math.max(safeWidth - inset * 2, 1)
  const contentHeight = Math.max(safeHeight - inset * 2, 1)
  const shapePath = getBaseShapePath({
    height: safeHeight,
    inset,
    shape,
    width: safeWidth,
  })
  const sloppinessOption = sloppinessOptions[defaultCanvasSloppiness]
  const random = createSeededRandom(seed)
  const strokePath =
    shape === "circle"
      ? getEllipseStrokePath({
          context: {
            ...sloppinessOption,
            random,
            strokeWidth,
          },
          cx: safeWidth / 2,
          cy: safeHeight / 2,
          rx: contentWidth / 2,
          ry: contentHeight / 2,
        })
      : getClosedStrokePath(shapePath, {
          ...sloppinessOption,
          random,
          strokeWidth,
        })

  const paths: ShapePath[] = []

  if (fill !== "transparent") {
    paths.push({
      d: shape === "circle"
        ? getEllipseBasePath({
            cx: safeWidth / 2,
            cy: safeHeight / 2,
            rx: contentWidth / 2,
            ry: contentHeight / 2,
          })
        : getClosedBasePath(shapePath),
      fill,
      stroke: "none",
    })
  }

  paths.push({
    d: strokePath,
    fill: "none",
    stroke,
    strokeWidth,
  })

  return paths
}

export function getSvgViewBox(width: number, height: number) {
  return `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`
}

function getBaseShapePath({
  height,
  inset,
  shape,
  width,
}: {
  height: number
  inset: number
  shape: CanvasShape
  width: number
}) {
  if (shape === "rectangle") {
    return getRoundedRectanglePoints({ height, inset, width })
  }

  return getRoundedDiamondPoints({ height, inset, width })
}

function getRoundedRectanglePoints({
  height,
  inset,
  width,
}: {
  height: number
  inset: number
  width: number
}) {
  const left = inset
  const top = inset
  const right = width - inset
  const bottom = height - inset
  const radius = Math.min(
    Math.max(Math.min(width, height) * 0.16, 12),
    (right - left) / 2,
    (bottom - top) / 2,
  )

  return [
    {
      corner: { x: right, y: top },
      from: { x: left + radius, y: top },
      to: { x: right - radius, y: top },
    },
    {
      corner: { x: right, y: bottom },
      from: { x: right, y: top + radius },
      to: { x: right, y: bottom - radius },
    },
    {
      corner: { x: left, y: bottom },
      from: { x: right - radius, y: bottom },
      to: { x: left + radius, y: bottom },
    },
    {
      corner: { x: left, y: top },
      from: { x: left, y: bottom - radius },
      to: { x: left, y: top + radius },
    },
  ]
}

function getRoundedDiamondPoints({
  height,
  inset,
  width,
}: {
  height: number
  inset: number
  width: number
}) {
  const top = { x: width / 2, y: inset }
  const right = { x: width - inset, y: height / 2 }
  const bottom = { x: width / 2, y: height - inset }
  const left = { x: inset, y: height / 2 }
  const corners = [top, right, bottom, left]
  const cornerRadius = Math.min(
    Math.max(Math.min(width, height) * 0.14, 10),
    Math.min(width, height) / 3,
  )

  return corners.map((corner, index) => {
    const previousCorner = corners[(index + corners.length - 1) % corners.length]
    const nextCorner = corners[(index + 1) % corners.length]

    return {
      corner,
      from: movePointTowards(corner, previousCorner, cornerRadius),
      to: movePointTowards(corner, nextCorner, cornerRadius),
    }
  })
}

function getClosedBasePath(
  points: Array<{
    corner: PathPoint
    from: PathPoint
    to: PathPoint
  }>,
) {
  const commands = [`M ${toSvgPoint(points[0].from)}`]

  points.forEach((point, index) => {
    commands.push(`L ${toSvgPoint(point.to)}`)

    const nextPoint = points[(index + 1) % points.length]
    commands.push(`Q ${toSvgPoint(point.corner)} ${toSvgPoint(nextPoint.from)}`)
  })

  commands.push("Z")

  return commands.join(" ")
}

function getClosedStrokePath(
  points: Array<{
    corner: PathPoint
    from: PathPoint
    to: PathPoint
  }>,
  context: StrokeContext,
) {
  const jitteredStarts = points.map((point) =>
    jitterPoint(point.from, context.pointJitter * context.strokeWidth, context.random),
  )
  const jitteredEnds = points.map((point) =>
    jitterPoint(point.to, context.pointJitter * context.strokeWidth, context.random),
  )
  const jitteredCorners = points.map((point) =>
    jitterPoint(
      point.corner,
      context.controlJitter * context.strokeWidth * 0.7,
      context.random,
    ),
  )
  const commands = [`M ${toSvgPoint(jitteredStarts[0])}`]

  points.forEach((point, index) => {
    commands.push(
      `Q ${toSvgPoint(
        getEdgeControlPoint(point.from, point.to, context),
      )} ${toSvgPoint(jitteredEnds[index])}`,
    )

    const nextIndex = (index + 1) % points.length
    commands.push(
      `Q ${toSvgPoint(jitteredCorners[index])} ${toSvgPoint(jitteredStarts[nextIndex])}`,
    )
  })

  commands.push("Z")

  return commands.join(" ")
}

function getEllipseBasePath({
  cx,
  cy,
  rx,
  ry,
}: {
  cx: number
  cy: number
  rx: number
  ry: number
}) {
  const kappa = 0.5522847498
  const controlX = rx * kappa
  const controlY = ry * kappa

  return [
    `M ${cx} ${cy - ry}`,
    `C ${cx + controlX} ${cy - ry} ${cx + rx} ${cy - controlY} ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + controlY} ${cx + controlX} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx - controlX} ${cy + ry} ${cx - rx} ${cy + controlY} ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - controlY} ${cx - controlX} ${cy - ry} ${cx} ${cy - ry}`,
    "Z",
  ].join(" ")
}

function getEllipseStrokePath({
  context,
  cx,
  cy,
  rx,
  ry,
}: {
  context: StrokeContext
  cx: number
  cy: number
  rx: number
  ry: number
}) {
  const kappa = 0.5522847498
  const controlX = rx * kappa
  const controlY = ry * kappa
  const anchorJitter = context.pointJitter * context.strokeWidth
  const controlJitter = context.controlJitter * context.strokeWidth
  const top = jitterPoint({ x: cx, y: cy - ry }, anchorJitter, context.random)
  const right = jitterPoint({ x: cx + rx, y: cy }, anchorJitter, context.random)
  const bottom = jitterPoint({ x: cx, y: cy + ry }, anchorJitter, context.random)
  const left = jitterPoint({ x: cx - rx, y: cy }, anchorJitter, context.random)

  return [
    `M ${toSvgPoint(top)}`,
    `C ${toSvgPoint(
      jitterPoint(
        { x: cx + controlX, y: cy - ry + context.bowing * 0.45 * context.strokeWidth },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(
      jitterPoint(
        { x: cx + rx - context.bowing * 0.35 * context.strokeWidth, y: cy - controlY },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(right)}`,
    `C ${toSvgPoint(
      jitterPoint(
        { x: cx + rx - context.bowing * 0.35 * context.strokeWidth, y: cy + controlY },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(
      jitterPoint(
        { x: cx + controlX, y: cy + ry - context.bowing * 0.45 * context.strokeWidth },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(bottom)}`,
    `C ${toSvgPoint(
      jitterPoint(
        { x: cx - controlX, y: cy + ry - context.bowing * 0.45 * context.strokeWidth },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(
      jitterPoint(
        { x: cx - rx + context.bowing * 0.35 * context.strokeWidth, y: cy + controlY },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(left)}`,
    `C ${toSvgPoint(
      jitterPoint(
        { x: cx - rx + context.bowing * 0.35 * context.strokeWidth, y: cy - controlY },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(
      jitterPoint(
        { x: cx - controlX, y: cy - ry + context.bowing * 0.45 * context.strokeWidth },
        controlJitter,
        context.random,
      ),
    )} ${toSvgPoint(top)}`,
    "Z",
  ].join(" ")
}

function getEdgeControlPoint(
  from: PathPoint,
  to: PathPoint,
  context: StrokeContext,
) {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const perpendicularX = -dy / length
  const perpendicularY = dx / length
  const bowAmount = context.bowing * context.strokeWidth * (context.random() - 0.5)

  return jitterPoint(
    {
      x: midX + perpendicularX * bowAmount,
      y: midY + perpendicularY * bowAmount,
    },
    context.controlJitter * context.strokeWidth * 0.7,
    context.random,
  )
}

function movePointTowards(
  from: PathPoint,
  to: PathPoint,
  distance: number,
) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const offset = Math.min(distance, length / 2)

  return {
    x: from.x + (dx / length) * offset,
    y: from.y + (dy / length) * offset,
  }
}

function jitterPoint(
  point: PathPoint,
  amount: number,
  random: () => number,
) {
  if (amount <= 0) {
    return point
  }

  return {
    x: point.x + (random() - 0.5) * amount * 2,
    y: point.y + (random() - 0.5) * amount * 2,
  }
}

function createSeededRandom(seed: number) {
  let state = Math.max(1, seed >>> 0)

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0

    return state / 4294967296
  }
}

function toSvgPoint(point: PathPoint) {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)}`
}

export function getStrokeLineDash(
  strokeStyle: CanvasStrokeStyle,
  strokeWidth: number,
): number[] | undefined {
  if (strokeStyle === "dashed") {
    return [strokeWidth * 3.5, strokeWidth * 2.25]
  }

  if (strokeStyle === "dotted") {
    return [0.01, strokeWidth * 2.6]
  }

  return undefined
}

export function getStrokeLineCap(
  _strokeStyle: CanvasStrokeStyle,
): "round" {
  return "round"
}
