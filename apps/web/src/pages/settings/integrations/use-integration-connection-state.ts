import * as React from "react";

type DualConnectionStatus = {
  personal: {
    connected?: boolean;
  };
  page: {
    connected?: boolean;
    enforceEmailMatch?: boolean;
  };
} | null;

export function useIntegrationConnectionState(status: DualConnectionStatus) {
  const isPageConnected = status?.page.connected === true;
  const isPersonalConnected = status?.personal.connected === true;
  const [pendingEmailMatch, setPendingEmailMatch] = React.useState(true);
  const enforceEmailMatch = isPageConnected
    ? status?.page.enforceEmailMatch === true
    : pendingEmailMatch;

  return {
    enforceEmailMatch,
    isPersonalConnected,
    isPageConnected,
    pendingEmailMatch,
    setPendingEmailMatch,
  };
}