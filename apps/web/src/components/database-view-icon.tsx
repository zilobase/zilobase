import type { PageDatabaseView } from "@zilobase/features/pages"

import { getDatabaseViewIcon } from "@/editor/extensions/database/views/database-view-config"
import { getDatabaseViewTypePresentation } from "@/editor/extensions/database/views/view-settings/view-type-options"
import { PageIconDisplay } from "@/features/pages/index"
import { cn } from "@/shared/lib/utils"

export function DatabaseViewIcon({
  className,
  view,
}: {
  className?: string
  view: Pick<PageDatabaseView, "config" | "type">
}) {
  const customIcon = getDatabaseViewIcon(view.config)

  if (customIcon) {
    return <PageIconDisplay className={className} size="sm" value={customIcon} />
  }

  const { Icon } = getDatabaseViewTypePresentation(view.type)

  return <Icon className={cn("size-4 shrink-0", className)} />
}
