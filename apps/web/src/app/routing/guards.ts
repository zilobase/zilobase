import { redirect } from "@tanstack/react-router";
import { isDatabasePublished as readDatabasePublished } from "@zilobase/features/databases";
import {
  isBootstrapRequiredAuthError,
  sessionQueryOptions,
  type SessionResponse,
} from "@zilobase/features/auth";
import {
  decidePageShareAccess,
  decidePublishedShareAccess,
  pagesQueryOptions,
  resolveNavigationReference,
  type PageDetail,
} from "@zilobase/features/pages";
import {
  resolveActiveWorkspaceId,
  workspacesQueryOptions,
  type Workspace,
} from "@zilobase/features/workspaces";
import { isOAuthLoginSearch, pickOAuthSearch } from "@zilobase/features/oauth";
import { getAuthReturnPath } from "@/platform/auth/google-auth";
import { isHostedDemoRuntime } from "@/app/demo/runtime";
import { queryClient } from "@/app/query-client";
import { webAuthClient } from "@/app/providers/features-provider";
import { useAppStore } from "@/app/state/app-store";
import { NetworkUnavailableError, apiFetch } from "@/platform/network/api";
import { getMostRecentItemPath } from "./start-destination";
import { getConnectivityState } from "@/platform/network/connectivity";
import { hydratePageReadCache } from "@/sections/pages/lib/page-read-cache";

import type {
  validateLoginSearch,
  validateSignupSearch,
  validateOAuthConsentSearch,
} from "./search-validators";

const NAVIGATION_AUTH_STALE_TIME = 30_000;

export async function applyAppAccess() {
  const session = await getFreshSession();
  if (!session.user) throw redirect({ to: "/login" });
  const workspaces = await getWorkspaces();
  if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
}

export async function applyStartRedirect(): Promise<never> {
  const session = await getFreshSession({ optional: true });
  if (!session.user) throw redirect({ to: "/login" });
  const workspaces = await getWorkspaces();
  if (isHostedDemoRuntime()) {
    const { startPath } = await apiFetch<{ startPath: string }>("/demo/bootstrap", {
      method: "GET",
    });
    throw redirect({ href: startPath });
  }
  if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
  throw redirect({ href: await getDefaultAppPath(session, workspaces) });
}

export async function applyLoginAccess(search: ReturnType<typeof validateLoginSearch>) {
  if (isBootstrapRequiredAuthError(search.error)) {
    throw redirect({ to: "/setup" });
  }
  const session = await getFreshSession({ optional: true });
  if (!session.user) return;
  if (isOAuthLoginSearch(search)) {
    throw redirect({
      search: pickOAuthSearch(search),
      to: "/oauth/consent",
    });
  }
  if (search.returnTo) {
    throw redirect({
      href: getAuthReturnPath(
        "/recents",
        new URLSearchParams({ returnTo: search.returnTo }).toString(),
      ),
    });
  }
  const workspaces = await getWorkspaces();
  throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
}

export async function applySignupAccess(search: ReturnType<typeof validateSignupSearch>) {
  const session = await getFreshSession({ optional: true });
  if (!session.user) return;
  if (search.returnTo) {
    throw redirect({
      href: getAuthReturnPath("/recents", `?returnTo=${encodeURIComponent(search.returnTo)}`),
    });
  }
  const workspaces = await getWorkspaces();
  throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
}

export async function applyOnboardingAccess() {
  const session = await getFreshSession();
  if (!session.user) throw redirect({ to: "/login" });
  const workspaces = await getWorkspaces();
  if (workspaces.length > 0) throw redirect({ to: "/recents" });
}

export async function applyOAuthConsentAccess(
  search: ReturnType<typeof validateOAuthConsentSearch>,
) {
  const session = await getFreshSession({ optional: true });
  if (!session.user) {
    throw redirect({
      search: pickOAuthSearch(search),
      to: "/login",
    });
  }
}

export async function applyPageShareAccess(pageId: string) {
  const decision = await decidePageShareAccess({
    apiFetch,
    queryClient,
    pageId,
    getSession: () => getFreshSession({ optional: true }),
    getWorkspaces,
    isOnline: () => getConnectivityState() !== "offline",
  });
  if (decision.type === "unavailable") throw new NetworkUnavailableError();
  if (decision.type === "login") throw redirect({ to: "/login" });
  if (decision.type === "onboarding") throw redirect({ to: "/onboarding" });
  if (decision.session) {
    await hydrateCachedPageQueries(decision.session, pageId, decision.memberDetail!);
  }
  return decision.type;
}

async function hydrateCachedPageQueries(
  session: SessionResponse,
  pageId: string,
  detail: PageDetail,
) {
  if (!session.user) return;
  await hydratePageReadCache({
    queryClient,
    userId: session.user.id,
    sessionId: session.session?.id ?? "public",
    pageId,
    workspaceId: detail.page.workspaceId,
    databaseIds: detail.databaseIds ?? [],
  }).catch(() => undefined);
}

export function applyDatabaseShareAccess(databaseId: string) {
  return applyPublishedShareAccess(() => readDatabasePublished(apiFetch, databaseId));
}

export async function getFreshSession(options?: { optional?: boolean }) {
  try {
    return await queryClient.fetchQuery({
      ...sessionQueryOptions(webAuthClient),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });
  } catch (error) {
    if (options?.optional && error instanceof NetworkUnavailableError)
      return { session: null, user: null };
    throw error;
  }
}

export function getWorkspaces() {
  return queryClient.fetchQuery({
    ...workspacesQueryOptions(webAuthClient),
    staleTime: NAVIGATION_AUTH_STALE_TIME,
  });
}

export async function getDefaultAppPath(session: SessionResponse, workspaces: Workspace[]) {
  const workspaceId = resolveActiveWorkspaceId({
    preferredActiveWorkspaceId: useAppStore.getState().activeWorkspaceId,
    sessionWorkspaceId: session.session?.activeWorkspaceId ?? null,
    workspaces,
    status: "success",
  });
  if (!workspaceId) return "/recents";
  try {
    const navigation = await queryClient.fetchQuery({
      ...pagesQueryOptions(apiFetch, workspaceId),
      staleTime: NAVIGATION_AUTH_STALE_TIME,
    });
    return navigation
      ? (getMostRecentItemPath(resolveNavigationReference(queryClient, navigation)) ?? "/recents")
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
  if (decision.type === "login") throw redirect({ to: "/login" });
  if (decision.type === "onboarding") throw redirect({ to: "/onboarding" });
  return decision.type;
}
