export type DatabaseBlockOptions = {
  currentPageId?: string | null
  editable?: boolean
  onOpenPage?: (pageId: string) => void
  organizationId?: string | null
}
