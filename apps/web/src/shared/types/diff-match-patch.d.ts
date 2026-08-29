declare module "diff-match-patch" {
  export const DIFF_DELETE: -1
  export const DIFF_EQUAL: 0
  export const DIFF_INSERT: 1

  export type DiffOperation =
    | typeof DIFF_DELETE
    | typeof DIFF_EQUAL
    | typeof DIFF_INSERT
  export type Diff = [DiffOperation, string]

  export class diff_match_patch {
    diff_main(
      text1: string,
      text2: string,
      opt_checklines?: boolean,
      opt_deadline?: number,
    ): Diff[]
    diff_cleanupSemantic(diffs: Diff[]): void
    diff_cleanupEfficiency(diffs: Diff[]): void
  }

  export default diff_match_patch
}
