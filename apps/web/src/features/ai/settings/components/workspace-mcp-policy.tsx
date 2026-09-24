import { Trash2Icon } from "@/shared/components/icons";
import * as React from "react";
import { toast } from "sonner";

import { type McpApprovedServer, type McpWorkspacePolicy } from "@zilobase/features/ai-chat";
import { useMcpPolicyMutation, useMcpWorkspacePolicy } from "@zilobase/features/ai-chat/react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";

export function WorkspaceMcpPolicyPanel() {
  const policyQuery = useMcpWorkspacePolicy();
  const [customServersEnabled, setCustomServersEnabled] = React.useState(false);
  const [externalWritesEnabled, setExternalWritesEnabled] = React.useState(false);
  const [installationPolicy, setInstallationPolicy] =
    React.useState<McpWorkspacePolicy["installationPolicy"]>("approved_and_catalog");
  const [serverLabel, setServerLabel] = React.useState("");
  const [serverUrl, setServerUrl] = React.useState("");
  const updatePolicy = useMcpPolicyMutation<McpWorkspacePolicy, { policy: McpWorkspacePolicy }>(
    () => "/api/ai/mcp/policy",
    "PUT",
  );
  const addServer = useMcpPolicyMutation<
    { endpointUrl: string; label: string },
    { server: McpApprovedServer }
  >(() => "/api/ai/mcp/approved-servers", "POST");
  const removeServer = useMcpPolicyMutation<{ serverId: string }, { removed: boolean }>(
    (input) => `/api/ai/mcp/approved-servers/${input.serverId}`,
    "DELETE",
  );

  React.useEffect(() => {
    if (!policyQuery.data) return;
    setCustomServersEnabled(policyQuery.data.policy.customServersEnabled);
    setExternalWritesEnabled(policyQuery.data.policy.externalWritesEnabled);
    setInstallationPolicy(policyQuery.data.policy.installationPolicy);
  }, [policyQuery.data]);

  if (!policyQuery.data) return null;

  const savePolicy = async () => {
    try {
      await updatePolicy.mutateAsync({
        customServersEnabled,
        externalWritesEnabled,
        installationPolicy,
        workspaceId: policyQuery.data.policy.workspaceId,
      });
      toast.success("Workspace MCP policy saved.");
    } catch (error) {
      showError("Could not save MCP policy", error);
    }
  };

  const approveServer = async () => {
    try {
      await addServer.mutateAsync({ endpointUrl: serverUrl.trim(), label: serverLabel.trim() });
      setServerLabel("");
      setServerUrl("");
      toast.success("Custom MCP server approved.");
    } catch (error) {
      showError("Could not approve server", error);
    }
  };

  return (
    <div className="hidden gap-3 rounded-lg border p-4 md:grid">
      <div>
        <h4 className="text-sm font-medium">Workspace MCP policy</h4>
        <p className="text-xs text-content-secondary">Visible to workspace owners and admins.</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        Allow approved custom HTTPS servers
        <Switch checked={customServersEnabled} onCheckedChange={setCustomServersEnabled} />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        Allow external write tools
        <Switch checked={externalWritesEnabled} onCheckedChange={setExternalWritesEnabled} />
      </label>
      <label className="grid gap-1 text-sm">
        Installation policy
        <Select
          onValueChange={(value) =>
            setInstallationPolicy(value as McpWorkspacePolicy["installationPolicy"])
          }
          value={installationPolicy}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approved_and_catalog">Approved and curated catalog</SelectItem>
            <SelectItem value="approved_only">Approved servers only</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button
        className="w-fit"
        disabled={updatePolicy.isPending}
        onClick={() => void savePolicy()}
        type="button"
      >
        Save policy
      </Button>

      <div className="mt-2 grid gap-2 border-t pt-3">
        <p className="text-sm font-medium">Exact approved server URLs</p>
        {policyQuery.data.approvedServers.map((server) => (
          <div className="flex min-w-0 items-center gap-2 text-sm" key={server.id}>
            <span className="font-medium">{server.label}</span>
            <span className="min-w-0 flex-1 truncate text-content-secondary">
              {server.endpointUrl}
            </span>
            <Button
              aria-label="Remove approved server"
              onClick={() => void removeServer.mutateAsync({ serverId: server.id })}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-36"
            onChange={(event) => setServerLabel(event.target.value)}
            placeholder="Server label"
            value={serverLabel}
          />
          <Input
            className="min-w-52 flex-1"
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://mcp.example.com/mcp"
            type="url"
            value={serverUrl}
          />
          <Button
            disabled={!serverLabel.trim() || !serverUrl.trim()}
            onClick={() => void approveServer()}
            type="button"
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

function showError(title: string, error: unknown) {
  toast.error(title, {
    description: error instanceof Error ? error.message : "Try again.",
  });
}
