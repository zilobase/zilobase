import { UploadIcon } from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";

import { Spinner } from "@/shared/ui/spinner";

import { useNotionImport } from "@/features/notion-import/index";

export function WorkspaceImportSection({
  workspaceId,
}: {
  workspaceId: string | null | undefined;
}) {
  const { handleImportFile, inputRef, isImporting, openImportPicker } = useNotionImport({
    workspaceId,
  });

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">Import</h3>
          <p className="text-sm text-content-secondary">
            Bring pages into this workspace from a Notion HTML zip export.
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!workspaceId || isImporting}
          onClick={openImportPicker}
          type="button"
        >
          {isImporting ? <Spinner /> : <UploadIcon />}
          Import Notion
        </Button>
      </div>
      <input
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(event) => {
          void handleImportFile(event);
        }}
        ref={inputRef}
        type="file"
      />
    </section>
  );
}
