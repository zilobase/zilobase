import { browser } from "wxt/browser";
import type { CreateClipRequest, CreateClipResponse } from "@zilobase/features/clips";

import { refreshClipperAccessToken } from "./oauth";
import type { ClipperSession } from "./session";

export async function createClip(session: ClipperSession, body: CreateClipRequest) {
  const response = await authorizedClipRequest(session, body);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? `Save failed (${response.status})`);
  }

  return (await response.json()) as CreateClipResponse;
}

async function authorizedClipRequest(session: ClipperSession, body: CreateClipRequest) {
  const response = await postClip(session, body);
  if (response.status !== 401 || !session.refreshToken) {
    return response;
  }

  const refreshed = await refreshClipperAccessToken(session);
  return postClip(refreshed, body);
}

function postClip(session: ClipperSession, body: CreateClipRequest) {
  return fetch(new URL("/clips", session.instanceUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
      "x-zilobase-workspace-id": session.workspaceId,
    },
    body: JSON.stringify(body),
  });
}

export function openClippedPage(session: ClipperSession, path: string) {
  const url = new URL(path, session.webOrigin ?? session.instanceUrl);
  void browser.tabs.create({ url: url.toString() });
}
