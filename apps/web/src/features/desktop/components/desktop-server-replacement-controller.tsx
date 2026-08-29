import * as React from "react";
import { DownloadIcon, RefreshCwIcon, Trash2Icon } from "@/shared/components/icons";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";
import { getApiErrorMessage } from "@/features/desktop/network/api";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "../diagnostics/desktop-diagnostics";
import {
  discardDesktopServerCandidate,
  desktopServersReferToSameInstance,
  getSelectedDesktopServer,
  prepareDesktopServerCandidate,
  type PreparedDesktopServer,
} from "../server/desktop-server";
import {
  createDesktopServerReplacementDependencies,
  subscribeDesktopServerReplacement,
  type DesktopServerReplacementRequest,
} from "../server/desktop-server-replacement";
import {
  assertPreparedServerMatchesRequest,
  executeDesktopServerReplacement,
} from "../server/desktop-server-replacement-core";
import { executeDesktopServerSwitch } from "../server/desktop-server-switch";
import { cancelDesktopBrowserSignIn } from "../auth/browser-authorization";
import {
  downloadRecoveryArchive,
  syncDirtyOfflinePages,
} from "@/features/offline/index";


type ReplacementContext = {
  prepared: PreparedDesktopServer;
  request: DesktopServerReplacementRequest;
};

type ReplacementState =
  | { phase: "idle" }
  | { phase: "verifying" }
  | ({
      phase:
        | "confirm"
        | "drafts"
        | "discard"
        | "exporting"
        | "rechecking"
        | "replacing"
        | "syncing";
    } & ReplacementContext)
  | { phase: "error"; message: string }
  | { phase: "fatal"; message: string };

export function DesktopServerReplacementController({
  openPath,
}: {
  openPath: (path: string) => void;
}) {
  const [state, setState] = React.useState<ReplacementState>({ phase: "idle" });
  const stateRef = React.useRef(state);
  const verificationOperation = React.useRef(0);
  stateRef.current = state;

  const cancelCandidate = React.useCallback(async () => {
    verificationOperation.current += 1;
    const current = stateRef.current;
    if ("prepared" in current) {
      await discardDesktopServerCandidate(current.prepared.candidateId).catch(
        () => undefined,
      );
    }
    setState({ phase: "idle" });
  }, []);

  React.useEffect(
    () =>
      subscribeDesktopServerReplacement((request) => {
        const previous = stateRef.current;
        if (isReplacementBusy(previous)) return;
        const operation = ++verificationOperation.current;
        if ("prepared" in previous) {
          void discardDesktopServerCandidate(previous.prepared.candidateId);
        }
        setState({ phase: "verifying" });
        recordDesktopDiagnostic("server_replacement.verification", {
          status: "started",
        });
        void prepareDesktopServerCandidate(request.serverUrl)
          .then(
            async (prepared) => {
              if (operation !== verificationOperation.current) {
                await discardDesktopServerCandidate(prepared.candidateId).catch(
                  () => undefined,
                );
                return;
              }
              try {
                assertPreparedServerMatchesRequest(prepared, request);
              } catch (error) {
                await discardDesktopServerCandidate(prepared.candidateId).catch(
                  () => undefined,
                );
                throw error;
              }
              const current = getSelectedDesktopServer();
              if (
                current &&
                desktopServersReferToSameInstance(current, prepared.server)
              ) {
                await discardDesktopServerCandidate(prepared.candidateId);
                setState({ phase: "idle" });
                if (request.path) openPath(request.path);
                return;
              }

              recordDesktopDiagnostic("server_replacement.verification", {
                status: "success",
              });
              setState({
                phase: "replacing",
                prepared,
                request,
              });
              await executeDesktopServerSwitch({
                candidateId: prepared.candidateId,
                path: request.path ?? "/login",
                server: prepared.server,
              });
            },
            (error) => {
              if (operation !== verificationOperation.current) return;
              recordDesktopDiagnostic(
                "server_replacement.verification",
                describeDesktopError(error),
                "error",
              );
              setState({ phase: "error", message: getApiErrorMessage(error) });
            },
          )
          .catch((error) => {
            if (operation !== verificationOperation.current) return;
            recordDesktopDiagnostic(
              "server_replacement.verification",
              describeDesktopError(error),
              "error",
            );
            setState({ phase: "error", message: getApiErrorMessage(error) });
          });
      }),
    [openPath],
  );

  const replaceServer = React.useCallback(
    async (context: ReplacementContext) => {
      const current = getSelectedDesktopServer();
      if (!current) {
        setState({
          phase: "error",
          message: "The current desktop server is unavailable.",
        });
        return;
      }

      setState({ ...context, phase: "rechecking" });
      let refreshed: PreparedDesktopServer;
      try {
        const candidate = await prepareDesktopServerCandidate(
          context.request.serverUrl,
        );
        try {
          assertPreparedServerMatchesRequest(candidate, context.request);
          if (
            !desktopServersReferToSameInstance(
              context.prepared.server,
              candidate.server,
            )
          ) {
            throw new Error(
              "The server identity changed during confirmation. Review the server and try again.",
            );
          }
        } catch (error) {
          await discardDesktopServerCandidate(candidate.candidateId).catch(
            () => undefined,
          );
          throw error;
        }
        refreshed = candidate;
        await discardDesktopServerCandidate(context.prepared.candidateId).catch(
          () => undefined,
        );
      } catch (error) {
        recordDesktopDiagnostic(
          "server_replacement.reverification",
          describeDesktopError(error),
          "error",
        );
        setState({ phase: "error", message: getApiErrorMessage(error) });
        return;
      }

      const refreshedContext = { ...context, prepared: refreshed };
      setState({ ...refreshedContext, phase: "replacing" });
      recordDesktopDiagnostic("server_replacement.commit", {
        status: "started",
      });
      try {
        await executeDesktopServerReplacement(
          refreshed,
          current,
          context.request.path,
          createDesktopServerReplacementDependencies({
            beforeLocalCleanup: async () => {
              await cancelDesktopBrowserSignIn().catch(() => undefined);
              openPath("/login");
              await afterReactTeardown();
            },
            reload: (path) => window.location.assign(path),
          }),
        );
        recordDesktopDiagnostic("server_replacement.commit", {
          status: "success",
        });
      } catch (error) {
        recordDesktopDiagnostic(
          "server_replacement.commit",
          describeDesktopError(error),
          "error",
        );
        setState({
          phase: "fatal",
          message: `${getApiErrorMessage(error)} Restart Zilobase before trying again.`,
        });
      }
    },
    [openPath],
  );

  const syncAndReplace = async (context: ReplacementContext) => {
    setState({ ...context, phase: "syncing" });
    try {
      const results = await syncDirtyOfflinePages();
      if (!results.every((result) => result.success)) {
        throw new Error(
          "Some drafts could not be synced. Export them or cancel.",
        );
      }
      await replaceServer(context);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      setState({ ...context, phase: "drafts" });
    }
  };

  const exportAndReplace = async (context: ReplacementContext) => {
    setState({ ...context, phase: "exporting" });
    try {
      await downloadRecoveryArchive();
      await replaceServer(context);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      setState({ ...context, phase: "drafts" });
    }
  };

  const context = "prepared" in state ? state : null;
  const busy =
    state.phase === "verifying" ||
    state.phase === "syncing" ||
    state.phase === "exporting" ||
    state.phase === "rechecking" ||
    state.phase === "replacing";

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !busy) void cancelCandidate();
      }}
      open={state.phase !== "idle"}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{replacementTitle(state)}</AlertDialogTitle>
          <AlertDialogDescription>
            {replacementDescription(state)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.phase === "drafts" && context ? (
          <div className="grid gap-2">
            <Button onClick={() => void syncAndReplace(context)} type="button">
              <RefreshCwIcon /> Sync drafts and change
            </Button>
            <Button
              onClick={() => void exportAndReplace(context)}
              type="button"
              variant="outline"
            >
              <DownloadIcon /> Export recovery and change
            </Button>
            <Button
              onClick={() => setState({ ...context, phase: "discard" })}
              type="button"
              variant="destructive"
            >
              <Trash2Icon /> Discard drafts
            </Button>
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <Spinner />
            {state.phase === "verifying"
              ? "Checking discovery metadata, TLS, and compatibility..."
              : state.phase === "syncing"
                ? "Syncing local drafts with the current server..."
                : state.phase === "exporting"
                  ? "Creating a local recovery archive..."
                  : state.phase === "rechecking"
                    ? "Rechecking the server before removing local data..."
                    : "Switching servers..."}
          </div>
        ) : null}

        <AlertDialogFooter>
          {state.phase === "error" ? (
            <AlertDialogAction onClick={() => setState({ phase: "idle" })}>
              Close
            </AlertDialogAction>
          ) : state.phase === "fatal" ? (
            <AlertDialogAction onClick={() => window.location.reload()}>
              Restart Zilobase
            </AlertDialogAction>
          ) : !busy ? (
            <AlertDialogCancel onClick={() => void cancelCandidate()}>
              Cancel
            </AlertDialogCancel>
          ) : null}
          {state.phase === "confirm" && context ? (
            <AlertDialogAction
              onClick={() => void replaceServer(context)}
              variant="destructive"
            >
              Change server
            </AlertDialogAction>
          ) : null}
          {state.phase === "discard" && context ? (
            <AlertDialogAction
              onClick={() => void replaceServer(context)}
              variant="destructive"
            >
              Permanently discard and change
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function replacementTitle(state: ReplacementState) {
  switch (state.phase) {
    case "verifying":
      return "Verify Zilobase server";
    case "confirm":
      return `Change to ${state.prepared.server.displayName}?`;
    case "drafts":
      return "Unsynced offline drafts";
    case "discard":
      return "Discard drafts and change server?";
    case "replacing":
      return "Changing server";
    case "rechecking":
      return "Reverify before changing";
    case "syncing":
      return "Sync drafts before changing";
    case "exporting":
      return "Export drafts before changing";
    case "error":
      return "Server could not be verified";
    case "fatal":
      return "Server change did not finish";
    case "idle":
      return "";
  }
}

function replacementDescription(state: ReplacementState) {
  switch (state.phase) {
    case "verifying":
      return "Your existing connection will not be changed during verification.";
    case "confirm":
      return "This signs out of the current server and permanently removes its credentials, cached data, offline documents, tabs, and local session state from this device.";
    case "drafts":
      return "Changing servers is blocked until you sync, export, or explicitly discard these local changes.";
    case "discard":
      return "These local drafts cannot be recovered unless you exported them first.";
    case "replacing":
      return "Keep Zilobase open while local data and credentials for the previous server are removed.";
    case "rechecking":
      return "The current connection remains untouched until this final compatibility check succeeds.";
    case "syncing":
      return "Zilobase will change servers only after every local draft is synchronized.";
    case "exporting":
      return "Save the recovery archive somewhere safe before Zilobase removes local data.";
    case "error":
    case "fatal":
      return state.message;
    case "idle":
      return "";
  }
}

function afterReactTeardown() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

function isReplacementBusy(state: ReplacementState) {
  return (
    state.phase === "syncing" ||
    state.phase === "exporting" ||
    state.phase === "rechecking" ||
    state.phase === "replacing"
  );
}
