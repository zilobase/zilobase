import { SettingsPage } from "../components/settings-layout";
import { WorkspaceMailConnectionSection } from "@/features/workspaces/settings/workspace-mail-connection";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";

export default function MailSettingsPage() {
  const workspaceId = useActiveWorkspaceId();

  return (
    <SettingsPage description="Connect the Gmail account used for this workspace." title="Mail">
      {workspaceId ? (
        <WorkspaceMailConnectionSection workspaceId={workspaceId} />
      ) : (
        <p className="text-sm text-content-secondary">Select a workspace to manage Mail.</p>
      )}
    </SettingsPage>
  );
}
