import type { IntegrationEndpoint } from "@/features/integrations/hooks";

import type { IntegrationId } from "../types";

export const integrationEndpointById: Record<
  IntegrationId,
  IntegrationEndpoint
> = {
  gmail: "gmail",
  github: "github",
  googleCalendar: "google-calendar",
  googleDrive: "google-drive",
  linear: "linear",
  slack: "slack",
};

export function readDisconnectIntegrationId(input: unknown) {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object" && "id" in input) {
    return (input as { id?: unknown }).id;
  }

  return null;
}
