export type CommentMentionTrigger = {
  end: number
  query: string
  start: number
}

export type CommentMentionMember = {
  email: string
  id: string
  name: string
}

export type CommentMentionTextPart = {
  isMention: boolean
  text: string
}

export function getCommentMentionTrigger(
  value: string,
  cursor: number | null | undefined,
): CommentMentionTrigger | null {
  if (cursor === null || cursor === undefined || cursor < 0) {
    return null
  }

  const beforeCursor = value.slice(0, cursor)
  const match = /(?:^|\s)@([^\s@]*)$/.exec(beforeCursor)

  if (!match) {
    return null
  }

  const query = match[1] ?? ""
  const start = beforeCursor.length - query.length - 1

  return { end: cursor, query, start }
}

export function insertCommentMention(
  value: string,
  trigger: CommentMentionTrigger,
  label: string,
) {
  const mention = `@${label.trim()} `
  const afterTrigger = value.slice(trigger.end)
  const suffix = afterTrigger.startsWith(" ")
    ? afterTrigger.slice(1)
    : afterTrigger
  const nextValue =
    value.slice(0, trigger.start) + mention + suffix

  return {
    cursor: trigger.start + mention.length,
    value: nextValue,
  }
}

export function filterCommentMentionMembers(
  members: CommentMentionMember[],
  currentUserId: string | null | undefined,
  query: string,
  limit = 8,
) {
  const normalizedQuery = query.trim().toLowerCase()

  return members
    .filter((member) => member.id !== currentUserId)
    .filter((member) => {
      if (!normalizedQuery) {
        return true
      }

      return (
        member.name.toLowerCase().includes(normalizedQuery) ||
        member.email.toLowerCase().includes(normalizedQuery)
      )
    })
    .slice(0, limit)
}

export function getCommentMentionLabels(members: CommentMentionMember[]) {
  return Array.from(
    new Set(
      members
        .flatMap((member) => [member.name, member.email])
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => right.length - left.length)
}

export function tokenizeCommentMentions(
  value: string,
  labels: string[],
): CommentMentionTextPart[] {
  if (!value || labels.length === 0) {
    return value ? [{ isMention: false, text: value }] : []
  }

  const parts: CommentMentionTextPart[] = []
  let cursor = 0

  while (cursor < value.length) {
    if (value[cursor] !== "@") {
      const nextMention = value.indexOf("@", cursor)
      const end = nextMention === -1 ? value.length : nextMention

      parts.push({ isMention: false, text: value.slice(cursor, end) })
      cursor = end
      continue
    }

    const label = labels.find((candidate) =>
      value.startsWith(`@${candidate}`, cursor),
    )

    if (!label) {
      parts.push({ isMention: false, text: value[cursor] ?? "" })
      cursor += 1
      continue
    }

    const end = cursor + label.length + 1
    const nextCharacter = value[end]

    if (nextCharacter && !/\s|[.,!?;:()[\]{}]/.test(nextCharacter)) {
      parts.push({ isMention: false, text: value[cursor] ?? "" })
      cursor += 1
      continue
    }

    parts.push({ isMention: true, text: value.slice(cursor, end) })
    cursor = end
  }

  return mergeAdjacentCommentMentionTextParts(parts)
}

function mergeAdjacentCommentMentionTextParts(parts: CommentMentionTextPart[]) {
  const merged: CommentMentionTextPart[] = []

  for (const part of parts) {
    const previous = merged[merged.length - 1]

    if (previous && previous.isMention === part.isMention) {
      previous.text += part.text
      continue
    }

    if (part.text) {
      merged.push({ ...part })
    }
  }

  return merged
}
