import { type ErrorComponentProps, useNavigate } from "@tanstack/react-router";
import { isDesktopApp } from "@/platform/environment";
import { useEffect, useState } from "react";

import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/platform/diagnostics/desktop-diagnostics";
import { executeDesktopServerSwitch } from "@/platform/server/operations/desktop-server-switch";
import {
  getSelectedDesktopServer,
  listDesktopServerProfiles,
  type DesktopServerProfile,
} from "@/platform/server/desktop-server";
import { Button } from "@/components/ui/button";
import { captureProductException } from "@/platform/analytics/posthog";

export default function RouteErrorPage({ error }: ErrorComponentProps) {
  const navigate = useNavigate();
  const selectedServer = getSelectedDesktopServer();
  const copy = describeRouteError(error, {
    isDesktop: isDesktopApp() || Boolean(selectedServer),
    selectedServer,
  });
  const [otherProfiles, setOtherProfiles] = useState<DesktopServerProfile[]>([]);

  useEffect(() => {
    captureProductException(error, { error_boundary: "router.error" });
    recordDesktopDiagnostic("router.error", describeDesktopError(error), "error");
  }, [error]);

  useEffect(() => {
    if (!copy.showChangeServer) return;
    let cancelled = false;
    void (async () => {
      let profiles: DesktopServerProfile[] = [];
      try {
        profiles = (await listDesktopServerProfiles()).profiles.filter(
          (profile) => !profile.active,
        );
      } catch {}
      if (!cancelled) setOtherProfiles(profiles);
    })();
    return () => {
      cancelled = true;
    };
  }, [copy.showChangeServer]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm text-content-secondary">{copy.description}</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          {otherProfiles.map((profile) => (
            <Button
              key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}
              onClick={() => {
                void executeDesktopServerSwitch({
                  hasCredentials: profile.hasCredentials,
                  path: profile.hasCredentials ? (profile.lastPath ?? "/recents") : "/login",
                  server: profile.server,
                  workspaceId: profile.lastActiveWorkspaceId,
                });
              }}
              variant="outline"
            >
              Switch to {profile.server.displayName}
            </Button>
          ))}
          {copy.showChangeServer ? (
            <Button onClick={() => void navigate({ to: "/connect" })} variant="outline">
              Change server
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export function describeRouteError(
  error: unknown,
  options: {
    isDesktop: boolean;
    selectedServer: unknown;
  },
) {
  const selectedServer = Boolean(options.selectedServer);
  const networkError = isNetworkUnavailableError(error);

  if (options.isDesktop) {
    return {
      description: selectedServer
        ? "Your desktop session is still saved. Check your connection, or connect to a different server."
        : "Your desktop session is still saved. Check your connection and try again.",
      showChangeServer: selectedServer,
      title: "Couldn't connect to Zilobase",
    };
  }

  if (networkError) {
    return {
      description: "Check your connection and try again.",
      showChangeServer: false,
      title: "Couldn't connect to Zilobase",
    };
  }

  return {
    description: "Please try again.",
    showChangeServer: false,
    title: "Something went wrong",
  };
}

function isNetworkUnavailableError(error: unknown) {
  return error instanceof Error && error.name === "NetworkUnavailableError";
}
