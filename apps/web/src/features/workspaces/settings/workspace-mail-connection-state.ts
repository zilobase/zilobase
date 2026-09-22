import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { desktopBridge } from "@/platform/desktop/native";

import { toast } from "sonner";
import { useSession } from "@zilobase/features/auth/react";
import {
  mailApiBasePath,
  mailConnectionQueryOptions,
} from "@zilobase/features/mail";

import { apiFetch, getApiErrorMessage, toApiUrl } from "@/platform/network/api";
import { isDesktopApp } from "@/platform/environment";

import {
  destroyMailDatabase,
  mailDatabaseName,
} from "@/features/mail/storage/mail-database";

export function useWorkspaceMailConnection({
  workspaceId,
}: {
  workspaceId: string | null | undefined;
}) {
  const { data: session } = useSession();
  const [connecting, setConnecting] = React.useState(false);
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const mailBasePath = mailApiBasePath(workspaceId);
  const connectionQuery = useQuery(
    mailConnectionQueryOptions(apiFetch, workspaceId),
  );
  const connection = connectionQuery.data ?? null;
  const connected = connection?.status === "connected";

  const connect = async () => {
    if (!workspaceId) return;
    setConnecting(true);
    try {
      const result = await apiFetch<{ authorizationUrl: string }>(
        `${mailBasePath}/oauth/start`,
        {
          body: JSON.stringify({ client: isDesktopApp() ? "desktop" : "web" }),
          method: "POST",
        },
      );
      if (isDesktopApp()) {
        await desktopBridge().auth.openMailUrl(result.authorizationUrl);
        toast.info("Finish connecting Gmail in your browser.");
        setConnecting(false);
      } else {
        window.location.assign(result.authorizationUrl);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!workspaceId) return;
    setDisconnecting(true);
    try {
      await apiFetch(`${mailBasePath}/connection`, { method: "DELETE" });
      if (connection?.connectionId && session?.user?.id) {
        await destroyMailDatabase(
          mailDatabaseName({
            apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
            bindingId: connection.bindingId ?? connection.connectionId,
            connectionId: connection.connectionId,
            userId: session.user.id,
            workspaceId,
          }),
        );
      }
      setDisconnectOpen(false);
      toast.success("Gmail disconnected from this workspace.");
      await connectionQuery.refetch();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setDisconnecting(false);
    }
  };

  return {
    connectionQuery,
    connection,
    connected,
    connecting,
    disconnectOpen,
    setDisconnectOpen,
    disconnecting,
    connect,
    disconnect,
  };
}
