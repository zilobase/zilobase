import { useReducer, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  initialDesktopServerSelectionState,
  reduceDesktopServerSelection,
} from "@/lib/desktop-server-selection";
import {
  CLOUD_DESKTOP_SERVER,
  getSelectedDesktopServer,
  isCloudDesktopServer,
} from "@/lib/desktop-server";
import { requestDesktopServerReplacement } from "@/lib/desktop-server-replacement";

export function DesktopServerSelector({
  actionLabel = "Change server",
}: {
  actionLabel?: string;
}) {
  const [selection, dispatch] = useReducer(
    reduceDesktopServerSelection,
    initialDesktopServerSelectionState,
  );
  const [serverUrl, setServerUrl] = useState("");
  const selectedServer = getSelectedDesktopServer();
  const onCloud = isCloudDesktopServer(selectedServer);

  const connectToCloud = () => {
    requestDesktopServerReplacement({
      serverUrl: CLOUD_DESKTOP_SERVER.apiOrigin,
    });
    dispatch({ type: "verified" });
  };

  if (!selectedServer) return null;

  if (selection.phase === "selected") {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs/relaxed font-medium">
            {selectedServer.displayName}
          </p>
          <p className="truncate text-xs/relaxed text-muted-foreground">
            {selectedServer.apiOrigin}
          </p>
        </div>
        <Button
          onClick={() => dispatch({ type: "edit" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          {actionLabel}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        requestDesktopServerReplacement({ serverUrl });
        setServerUrl("");
        dispatch({ type: "verified" });
      }}
    >
      <div className="space-y-1.5">
        <FieldLabel htmlFor="desktop-server-url">Server URL</FieldLabel>
        <Input
          autoCapitalize="none"
          autoComplete="url"
          autoCorrect="off"
          id="desktop-server-url"
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder="https://notes.example.com"
          required
          type="url"
          value={serverUrl}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Verify server
        </Button>
        <Button
          onClick={() => dispatch({ type: "cancel" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
      {onCloud ? null : (
        <Button
          onClick={connectToCloud}
          size="sm"
          type="button"
          variant="outline"
        >
          Use Zilobase Cloud
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        HTTPS is required except for localhost development servers.
      </p>
    </form>
  );
}
