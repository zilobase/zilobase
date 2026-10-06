import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { ApiFetcher } from "./api-fetcher";

export type { ApiFetcher } from "./api-fetcher";

import type { ZilobaseAuthClient } from "./auth-client";
export type { ZilobaseAuthClient } from "./auth-client";

export type ZilobaseFeaturesConfig = {
  apiFetch: ApiFetcher;
  auth: ZilobaseAuthClient;
  preferredActiveWorkspaceId?: string | null;
  queryClient: QueryClient;
  databaseRealtimeEnabled?: boolean;
  setPreferredActiveWorkspaceId?: (workspaceId: string | null) => void;
};

const ZilobaseFeaturesContext = createContext<ZilobaseFeaturesConfig | null>(null);

export function ZilobaseFeaturesProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: ZilobaseFeaturesConfig }>) {
  return (
    <ZilobaseFeaturesContext.Provider value={value}>{children}</ZilobaseFeaturesContext.Provider>
  );
}

export function useZilobaseFeatures() {
  const value = useContext(ZilobaseFeaturesContext);

  if (!value) {
    throw new Error(
      "ZilobaseFeaturesProvider is missing. Wrap your app before using @zilobase/features hooks.",
    );
  }

  return value;
}
