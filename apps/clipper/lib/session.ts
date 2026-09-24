import { browser } from "wxt/browser";

export type ClipperSession = {
  instanceUrl: string;
  refreshToken?: string;
  token: string;
  webOrigin?: string;
  workspaceId: string;
  workspaceName: string;
};

export type ClipperDestination = {
  id: string;
  kind: "page" | "database";
  title: string;
};

const sessionKey = "clipper.session";
const destinationKey = "clipper.destination";

export async function readSession() {
  const stored = await browser.storage.local.get(sessionKey);
  return (stored[sessionKey] as ClipperSession | undefined) ?? null;
}

export async function writeSession(session: ClipperSession) {
  await browser.storage.local.set({ [sessionKey]: session });
}

export async function clearSession() {
  await browser.storage.local.remove(sessionKey);
}

export async function readLastDestination() {
  const stored = await browser.storage.local.get(destinationKey);
  return (stored[destinationKey] as ClipperDestination | undefined) ?? null;
}

export async function writeLastDestination(destination: ClipperDestination) {
  await browser.storage.local.set({ [destinationKey]: destination });
}
