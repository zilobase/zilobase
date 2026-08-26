import { collaboratorColorIds } from "@/lib/color-tokens"

const collaboratorColorTokens = collaboratorColorIds.map(
  (id) => `--editor-${id}` as const,
)

export function collaborationColor(userId: string) {
  let hash = 0
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }

  const token =
    collaboratorColorTokens[Math.abs(hash) % collaboratorColorTokens.length] ??
    collaboratorColorTokens[0]

  if (typeof document !== "undefined") {
    const resolvedColor = getComputedStyle(document.documentElement)
      .getPropertyValue(token)
      .trim()

    // y-prosemirror appends an alpha channel to this value when it renders a
    // remote selection, so its awareness payload must contain six-digit RGB.
    if (/^#[0-9a-f]{6}$/i.test(resolvedColor)) return resolvedColor
  }

  return `var(${token})`
}
