import type { DesktopServer } from "@/lib/desktop-server";

const DESKTOP_CONNECT_LINK = "zilobase://connect";
const DESKTOP_OPEN_LINK = "zilobase://open";
const MAX_DEEP_LINK_LENGTH = 8 * 1024;
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type DesktopDeepLink =
  | { type: "connect"; serverUrl: string }
  | {
      type: "open";
      instanceId: string;
      path: string;
      serverUrl: string;
    };

export type DesktopDeepLinkAction =
  | { type: "open-path"; path: string }
  | {
      type: "change-server";
      expectedInstanceId?: string;
      path?: string;
      serverUrl: string;
    };

export function buildDesktopConnectLink(serverOrigin: string) {
  const serverUrl = normalizeServerOrigin(serverOrigin);
  if (!serverUrl) throw new Error("The desktop server origin is invalid.");
  const url = new URL(DESKTOP_CONNECT_LINK);
  url.searchParams.set("server", serverUrl);
  return url.toString();
}

export function buildDesktopDeepLink(
  path: string,
  server: Pick<DesktopServer, "apiOrigin" | "instanceId">,
) {
  const normalizedPath = normalizeAppPath(path);
  const serverUrl = normalizeServerOrigin(server.apiOrigin);
  if (
    !normalizedPath ||
    !serverUrl ||
    !INSTANCE_ID_PATTERN.test(server.instanceId)
  ) {
    throw new Error("The desktop link target is invalid.");
  }

  const url = new URL(DESKTOP_OPEN_LINK);
  url.searchParams.set("instance", server.instanceId);
  url.searchParams.set("server", serverUrl);
  url.searchParams.set("path", normalizedPath);
  return url.toString();
}

export function parseDesktopDeepLink(value: string): DesktopDeepLink | null {
  if (!value || value.length > MAX_DEEP_LINK_LENGTH) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "zilobase:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname ||
      url.hash
    ) {
      return null;
    }

    if (url.hostname === "connect") {
      if (!hasExactParameters(url.searchParams, ["server"])) return null;
      const serverUrl = normalizeServerOrigin(url.searchParams.get("server"));
      return serverUrl ? { type: "connect", serverUrl } : null;
    }

    if (url.hostname === "open") {
      if (
        !hasExactParameters(url.searchParams, ["instance", "path", "server"])
      ) {
        return null;
      }
      const instanceId = url.searchParams.get("instance") ?? "";
      const path = normalizeAppPath(url.searchParams.get("path"));
      const serverUrl = normalizeServerOrigin(url.searchParams.get("server"));
      return INSTANCE_ID_PATTERN.test(instanceId) && path && serverUrl
        ? { instanceId, path, serverUrl, type: "open" }
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function resolveDesktopDeepLinkAction(
  value: string,
  selectedServer: DesktopServer | null,
): DesktopDeepLinkAction | null {
  const link = parseDesktopDeepLink(value);
  if (!link) return null;

  if (link.type === "connect") {
    return { serverUrl: link.serverUrl, type: "change-server" };
  }

  if (
    selectedServer?.instanceId === link.instanceId &&
    selectedServer.apiOrigin === link.serverUrl &&
    selectedServer.issuer === link.serverUrl
  ) {
    return { path: link.path, type: "open-path" };
  }

  return {
    expectedInstanceId: link.instanceId,
    path: link.path,
    serverUrl: link.serverUrl,
    type: "change-server",
  };
}

function hasExactParameters(parameters: URLSearchParams, expected: string[]) {
  const keys = [...parameters.keys()];
  return (
    keys.length === expected.length &&
    expected.every((key) => parameters.getAll(key).length === 1)
  );
}

function normalizeServerOrigin(value: string | null) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !url.hostname
    ) {
      return null;
    }
    if (url.protocol === "https:") return url.origin;
    if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function normalizeAppPath(path: string | null) {
  if (!path?.startsWith("/") || path.startsWith("//") || path.length > 4096) {
    return null;
  }

  const url = new URL(path, "https://app.zilobase.com");
  if (url.origin !== "https://app.zilobase.com") return null;

  return `${url.pathname}${url.search}${url.hash}`;
}
