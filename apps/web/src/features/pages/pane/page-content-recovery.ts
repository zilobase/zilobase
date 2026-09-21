import {
  insertDatabaseBlockInContent,
  isEffectivelyEmptyPageContent,
} from "@zilobase/page-context";
import {
  getMissingPlacedDatabaseIds,
  type DatabasePlacement,
} from "../navigation/page-hierarchy-blocks";

export type PageContentHandle = {
  getContentJson: () => unknown;
  setContentJson: (content: unknown) => boolean;
};

// A null result stops structural recovery when the editor rejects restoration.
export function recoverPageEditorContent(handle: PageContentHandle, savedContent: unknown) {
  let content = handle.getContentJson();
  if (isEffectivelyEmptyPageContent(content) && !isEffectivelyEmptyPageContent(savedContent)) {
    if (!handle.setContentJson(savedContent)) return null;
    content = handle.getContentJson() ?? savedContent;
  }
  return { content };
}

export function recoverMissingPlacedDatabaseBlocks({
  handle,
  localStructuralInsertionPending,
  pageId,
  placements,
  savedContent,
}: {
  handle: PageContentHandle;
  localStructuralInsertionPending: boolean;
  pageId: string;
  placements: readonly DatabasePlacement[];
  savedContent: unknown;
}) {
  if (localStructuralInsertionPending) {
    return false;
  }

  const restored = recoverPageEditorContent(handle, savedContent);

  if (!restored) {
    return false;
  }

  const missingDatabaseIds = getMissingPlacedDatabaseIds(
    restored.content,
    placements,
    pageId,
  );

  if (missingDatabaseIds.length === 0) {
    return false;
  }

  let nextContent = restored.content;

  for (const databaseId of missingDatabaseIds) {
    nextContent = insertDatabaseBlockInContent(nextContent, {
      databaseId,
    }).content;
  }

  return handle.setContentJson(nextContent);
}
