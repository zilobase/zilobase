import { emitDatabaseMetric } from "@zilobase/features/databases"

export function markDatabaseInteractionPaint(startedAt: number) {
  requestAnimationFrame(() => {
    emitDatabaseMetric("drag_to_paint", performance.now() - startedAt)
  })
}
