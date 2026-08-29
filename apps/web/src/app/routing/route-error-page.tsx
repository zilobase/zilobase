import { type ErrorComponentProps } from "@tanstack/react-router";
import { isDesktopApp } from "@/features/desktop/index";
import { useEffect, useState } from "react";

import { describeRouteError } from "./route-error";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import {
  getSelectedDesktopServer,
  listDesktopServerProfiles,
  type DesktopServerProfile,
} from "@/features/desktop/server/index";
import { executeDesktopServerSwitch } from "@/features/desktop/server/index";
import { Button } from "@/shared/ui/button";

export function RouteErrorPage({ error }: ErrorComponentProps) {
  const selectedServer = getSelectedDesktopServer();
  const copy = describeRouteError(error, {
    isDesktop: isDesktopApp() || Boolean(selectedServer),
    selectedServer,
  });
  const [otherProfiles, setOtherProfiles] = useState<DesktopServerProfile[]>([]);

  useEffect(() => {
    recordDesktopDiagnostic(
      "router.error",
      describeDesktopError(error),
      "error",
    );
  }, [error]);

  useEffect(() => {
    if (!copy.showChangeServer) return;
    let disposed = false;
    void listDesktopServerProfiles()
      .then((result) => {
        if (!disposed) {
          setOtherProfiles(result.profiles.filter((profile) => !profile.active));
        }
      })
      .catch(() => {
        if (!disposed) setOtherProfiles([]);
      });
    return () => {
      disposed = true;
    };
  }, [copy.showChangeServer]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="mt-1 text-sm text-content-secondary">
            {copy.description}
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          {otherProfiles.map((profile) => (
            <Button
              key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}
              onClick={() => {
                void executeDesktopServerSwitch({
                  hasCredentials: profile.hasCredentials,
                  path: profile.hasCredentials
                    ? (profile.lastPath ?? "/recents")
                    : "/login",
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
            <Button
              onClick={() => window.location.assign("/connect")}
              variant="outline"
            >
              Change server
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
