import { redirect } from "@tanstack/react-router";
import { pageQueryOptions, pagesQueryOptions } from "@zilobase/features/pages";
import { sessionQueryOptions } from "@zilobase/features/auth";
import { workspacesQueryOptions } from "@zilobase/features/workspaces";

import { queryClient } from "@/shared/lib/query-client";
import { webAuthClient } from "@/app/providers/features-provider";
import { useAppStore } from "@/app/state/app-store";
import { ApiError, NetworkUnavailableError, apiFetch } from "@/lib/api";
import {
  resolveOfflineFallback,
  waitForSettledConnectivity,
} from "@/lib/connectivity-probe";
import {
  getConnectivityState,
  getOfflineManifest,
  getValidOfflineSession,
  subscribeConnectivity,
} from "@/lib/offline-store";
import { getMostRecentItemPath } from "@/lib/recent-navigation";
import { decidePublishedShareAccess } from "@/lib/published-share-access";

const NAVIGATION_AUTH_STALE_TIME = 30_000;

export async function applyPageShareAccess(pageId: string) {
  const session = await getFreshSession({ optional: true });

  if (!session.user) {
    return applyPublishedShareAccess(() => isPagePublished(pageId));
  }

  try {
    const detail = await queryClient.fetchQuery({
      ...pageQueryOptions(apiFetch, pageId),
    });

    if (detail?.viewerType === "guest") return "guest" as const;
    if (detail?.viewerType === "public") return "public" as const;
    if (detail?.viewerType === "member") return "app" as const;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ActiveWorkspaceMismatchError"
    ) {
      return "app" as const;
    }
    throw error;
  }

  const workspaces = await getWorkspaces();
  if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
  return "app" as const;
}

export function applyDatabaseShareAccess(databaseId: string) {
  return applyPublishedShareAccess(() => isDatabasePublished(databaseId));
}

export async function getFreshSession(options?: { optional?: boolean }) {
  const connectivity = await getStartupConnectivity();
  const cached = getValidOfflineSession();
  const decision = resolveOfflineFallback(connectivity, cached);
  if (decision.type === "fallback") {
    return {
      session: decision.value.session,
      user: decision.value.user,
      workspacePinned: decision.value.workspacePinned,
    };
  }
  if (decision.type === "unavailable") {
    if (options?.optional) return { session: null, user: null };
    throw new NetworkUnavailableError();
  }

  try {
    return await queryClient.fetchQuery({
      ...sessionQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });
  } catch (error) {
    if (error instanceof NetworkUnavailableError && cached) {
      return {
        session: cached.session,
        user: cached.user,
        workspacePinned: cached.workspacePinned,
      };
    }
    if (options?.optional && error instanceof NetworkUnavailableError) {
      return { session: null, user: null };
    }
    throw error;
  }
}

export async function getWorkspaces() {
  const connectivity = await getStartupConnectivity();
  const cached = getOfflineManifest().workspaces;
  const decision = resolveOfflineFallback(
    connectivity,
    getValidOfflineSession() ? cached : null,
  );
  if (decision.type === "fallback") return decision.value;
  if (decision.type === "unavailable") {
    throw new NetworkUnavailableError();
  }

  try {
    return await queryClient.fetchQuery({
      ...workspacesQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });
  } catch (error) {
    if (error instanceof NetworkUnavailableError && getValidOfflineSession()) {
      return cached;
    }
    throw error;
  }
}

export async function getDefaultAppPath(
  session: Awaited<ReturnType<typeof getFreshSession>>,
  workspaces: Awaited<ReturnType<typeof getWorkspaces>>,
) {
  const preferredWorkspaceId = useAppStore.getState().activeWorkspaceId;
  const sessionWorkspaceId = session.session?.activeWorkspaceId ?? null;
  const workspaceId =
    workspaces.find((workspace) => workspace.id === preferredWorkspaceId)?.id ??
    workspaces.find((workspace) => workspace.id === sessionWorkspaceId)?.id ??
    workspaces[0]?.id;

  if (!workspaceId) return "/recents";

  const options = pagesQueryOptions(apiFetch, workspaceId);

  try {
    const navigation =
      getConnectivityState() !== "online"
        ? queryClient.getQueryData(options.queryKey)
        : await queryClient.fetchQuery({
            ...options,
            staleTime: NAVIGATION_AUTH_STALE_TIME,
          });

    return navigation
      ? getMostRecentItemPath(navigation) ?? "/recents"
      : "/recents";
  } catch {
    return "/recents";
  }
}

async function applyPublishedShareAccess(isPublished: () => Promise<boolean>) {
  const decision = await decidePublishedShareAccess({
    getSession: () => getFreshSession({ optional: true }),
    getWorkspaces,
    isPublished,
  });

  if (decision.type === "login") {
    throw redirect({ to: "/login" });
  }

  if (decision.type === "onboarding") {
    throw redirect({ to: "/onboarding" });
  }

  return decision.type;
}

function getStartupConnectivity() {
  return waitForSettledConnectivity({
    getState: getConnectivityState,
    subscribe: subscribeConnectivity,
  });
}

async function isPagePublished(pageId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(
      `/pages/${pageId}/published`,
      { auth: false, method: "GET" },
    );

    return result.published;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}

async function isDatabasePublished(databaseId: string) {
  try {
    const result = await apiFetch<{ published: boolean }>(
      `/databases/${databaseId}/published`,
      { auth: false, method: "GET" },
    );

    return result.published;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw error;
  }
}
