import DiffMatchPatch, {
  DIFF_DELETE,
  DIFF_EQUAL,
  DIFF_INSERT,
} from "diff-match-patch"

export type PageEditDiffOperation =
  | typeof DIFF_DELETE
  | typeof DIFF_EQUAL
  | typeof DIFF_INSERT

export type PageEditDiffSegment = {
  operation: PageEditDiffOperation
  text: string
}

const diffMatchPatch = new DiffMatchPatch()

export function buildPageEditDiffSegments(
  beforeMarkdown: string,
  afterMarkdown: string,
): PageEditDiffSegment[] {
  const diffs = diffMatchPatch.diff_main(beforeMarkdown, afterMarkdown, true)
  diffMatchPatch.diff_cleanupSemantic(diffs)

  return diffs
    .filter(([, text]) => Boolean(text))
    .map(([operation, text]) => ({
      operation: operation as PageEditDiffOperation,
      text,
    }))
}

export function hasPageEditDiffChanges(segments: PageEditDiffSegment[]) {
  return segments.some((segment) => segment.operation !== DIFF_EQUAL)
}