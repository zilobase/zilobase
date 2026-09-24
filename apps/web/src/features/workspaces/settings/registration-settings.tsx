import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { apiFetch } from "@/platform/network/api";

type RegistrationMode = "invite-only" | "open";

type InstanceSettingsResponse = {
  settings: {
    bootstrapCompleted: boolean;
    displayName: string;
    instanceId: string;
    pinnedWorkspaceId: string | null;
    registrationMode: RegistrationMode;
  };
};

const instanceSettingsQueryOptions = () =>
  queryOptions({
    queryFn: ({ signal }) =>
      apiFetch<InstanceSettingsResponse>("/api/instance/settings", { signal }),
    queryKey: ["instance", "settings"] as const,
  });

export function RegistrationSettingsSection() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(instanceSettingsQueryOptions());
  const updateSettings = useMutation({
    mutationFn: (registrationMode: RegistrationMode) =>
      apiFetch<InstanceSettingsResponse>("/api/instance/settings", {
        body: JSON.stringify({ registrationMode }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(instanceSettingsQueryOptions().queryKey, response);
      toast.success("Registration settings updated.");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not update registration settings.",
      );
    },
  });

  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base leading-snug font-medium">Server registration</h3>
        <p className="text-sm text-content-secondary">
          Choose who can create an account on this self-hosted server.
        </p>
      </div>
      <Field>
        <FieldLabel>Registration mode</FieldLabel>
        <Select
          disabled={settingsQuery.isLoading || updateSettings.isPending}
          onValueChange={(value) => updateSettings.mutate(value as RegistrationMode)}
          value={settingsQuery.data?.settings.registrationMode ?? ""}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Loading registration mode..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="invite-only">Invite only</SelectItem>
            <SelectItem value="open">Open registration</SelectItem>
          </SelectContent>
        </Select>
        <FieldDescription>
          Invite only requires a pending invitation. Open registration adds every verified account
          to this workspace as a member.
        </FieldDescription>
        {settingsQuery.isError ? (
          <FieldError>
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : "Could not load registration settings."}
          </FieldError>
        ) : null}
      </Field>
    </section>
  );
}
