import { WorkspaceMcpPolicyPanel } from "@/features/ai/settings/components/workspace-mcp-policy";
import { WorkspaceSettingsPage } from "@/features/workspaces";

export default function WorkspaceSettings() {
  return <WorkspaceSettingsPage policySettings={<WorkspaceMcpPolicyPanel />} />;
}
