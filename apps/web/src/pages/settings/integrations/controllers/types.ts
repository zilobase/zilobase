import type { Dispatch, SetStateAction } from "react";

import type { IntegrationId } from "../types";

export type IntegrationControllerContext = {
  canManagePage: boolean;
  isLoadingIntegrations: boolean;
  setIntegrationsError: Dispatch<SetStateAction<string | null>>;
  setSelectedIntegrationId: Dispatch<SetStateAction<IntegrationId | null>>;
};
