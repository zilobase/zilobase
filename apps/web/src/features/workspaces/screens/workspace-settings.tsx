import { WorkspaceDetailsSection } from "../settings/workspace-details";
import { WorkspaceImportSection } from "../settings/workspace-import";
import { DeleteWorkspaceSection } from "../settings/delete-workspace";
import type { ReactNode } from "react";

import { SettingsHeader } from "@/features/settings";
import { isFeatureEnabled } from "@/shared/config/feature-flags";

import { Separator } from "@/shared/ui/separator";

import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useWorkspaces } from "@zilobase/features/workspaces/react";

export default function WorkspaceSettingsPage({ policySettings }: { policySettings?: ReactNode }) {
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data: workspaces = [] } = useWorkspaces();
  const workspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? null;

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Workspace"
        description="Manage page details, billing identity, and defaults."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <WorkspaceDetailsSection workspace={workspace} />
        {policySettings}
        {isFeatureEnabled("notionImport") ? (
          <>
            <Separator />
            <WorkspaceImportSection workspaceId={activeWorkspaceId} />
          </>
        ) : null}
        <Separator />
        <DeleteWorkspaceSection
          remainingWorkspaceCount={Math.max(0, workspaces.length - 1)}
          workspace={workspace}
        />
      </div>
    </main>
  );
}
