import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { CollaborationUser } from "./use-page-collaboration"

export function CollaborationPresence({
  className,
  users,
}: {
  className?: string
  users: CollaborationUser[]
}) {
  const visibleUsers = users.slice(0, 4)
  const hiddenCount = Math.max(0, users.length - visibleUsers.length)

  return (
    <div
      className={cn(
        "absolute right-4 top-4 z-10 flex h-8 items-center gap-2",
        className,
      )}
      contentEditable={false}
    >
      {visibleUsers.length > 0 ? (
        <AvatarGroup>
          {visibleUsers.map((user) => (
            <Avatar key={user.id} size="sm" title={user.name}>
              {user.avatar ? <AvatarImage alt="" src={user.avatar} /> : null}
              <AvatarFallback gradientSeed={user.id}>
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
          ))}
          {hiddenCount > 0 ? (
            <AvatarGroupCount className="size-6 text-xs">
              +{hiddenCount}
            </AvatarGroupCount>
          ) : null}
        </AvatarGroup>
      ) : null}
    </div>
  )
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?"
}
