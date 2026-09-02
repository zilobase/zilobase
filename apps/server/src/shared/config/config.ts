export type RuntimeEnv = Record<string, unknown>;

export function isMailFeatureEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "MAIL_ENABLED")?.trim().toLowerCase() === "true";
}

export function isAutomationWebhooksEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AUTOMATION_WEBHOOKS_ENABLED")?.trim().toLowerCase() === "true";
}

export function getAutomationWebhookHttpDomains(env: RuntimeEnv) {
  return new Set((getStringEnv(env, "AUTOMATION_WEBHOOK_HTTP_DOMAINS") ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean));
}

export function isDatabaseAutomationsFeatureEnabled(
  env: RuntimeEnv,
  workspaceId: string,
) {
  if (
    getStringEnv(env, "DATABASE_AUTOMATIONS_ENABLED")
      ?.trim()
      .toLowerCase() === "true"
  ) {
    return true;
  }
  return (getStringEnv(env, "DATABASE_AUTOMATIONS_ENABLED_WORKSPACE_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .some((id) => id === "*" || id === workspaceId);
}

const DESKTOP_CLIENT_ORIGINS = [
  "tauri://localhost",
  "http://tauri.localhost",
] as const;

export function getClientOrigins(env: RuntimeEnv) {
  return getRequiredStringEnv(env, "CLIENT_URL")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getPrimaryClientOrigin(env: RuntimeEnv) {
  const [origin] = getClientOrigins(env);

  if (!origin) {
    throw new Error("CLIENT_URL must include at least one origin");
  }

  return origin;
}

function readCanonicalApiOrigin(env: RuntimeEnv) {
  try {
    return [getCanonicalApiOrigin(env)];
  } catch {
    return [];
  }
}

export function resolvePublicRequestUrl(
  request: Request,
  env: RuntimeEnv = {},
) {
  const incoming = new URL(request.url);
  const hostHeader =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const host = hostHeader?.split(",")[0]?.trim();

  if (host) {
    try {
      const hostname = new URL(`http://${host}`).hostname;
      if (isLocalDevelopmentHost(hostname)) {
        const protocol = request.headers.get("x-forwarded-proto") ?? "http";
        return new URL(
          `${incoming.pathname}${incoming.search}`,
          `${protocol}://${host}`,
        );
      }
    } catch {
      // Fall through to referer or the local adapter origin.
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (isLocalDevelopmentHost(refererUrl.hostname)) {
        return new URL(
          `${incoming.pathname}${incoming.search}`,
          refererUrl.origin,
        );
      }
    } catch {
      // Fall through to the local adapter origin.
    }
  }

  const localPort = getStringEnv(env, "ZILOBASE_ADAPTER_PORT");
  if (localPort && isLocalAuthConfiguration(env)) {
    return new URL(
      `${incoming.pathname}${incoming.search}`,
      `http://localhost:${localPort}`,
    );
  }

  return incoming;
}

function isLocalAuthConfiguration(env: RuntimeEnv) {
  const configured = getStringEnv(env, "BETTER_AUTH_URL");
  if (!configured) return false;

  try {
    return isLocalDevelopmentHost(new URL(configured).hostname);
  } catch {
    return false;
  }
}

export function getCanonicalApiOrigin(env: RuntimeEnv) {
  return getCanonicalHttpOrigin(
    getRequiredStringEnv(env, "BETTER_AUTH_URL"),
    "BETTER_AUTH_URL",
  );
}

export function getCanonicalWebOrigin(env: RuntimeEnv) {
  return getCanonicalHttpOrigin(
    getPrimaryClientOrigin(env),
    "the first CLIENT_URL origin",
  );
}

export function getCanonicalHttpOrigin(value: string, label = "origin") {
  const url = parseUrl(value);

  if (!url) {
    throw new Error(`${label} must be a valid URL`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use HTTPS or loopback HTTP`);
  }

  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error(`${label} must use HTTPS unless it is a loopback origin`);
  }

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${label} must be an origin without credentials, a path, a query, or a fragment`,
    );
  }

  return url.origin;
}

export function isAllowedClientOrigin(env: RuntimeEnv, origin: string | null) {
  if (!origin) {
    return false;
  }

  if (
    getClientOrigins(env).includes(origin) ||
    DESKTOP_CLIENT_ORIGINS.includes(
      origin as (typeof DESKTOP_CLIENT_ORIGINS)[number],
    )
  ) {
    return true;
  }

  const url = parseUrl(origin);

  if (!url) {
    return false;
  }

  return isExpoDevelopmentOrigin(url);
}

export function getTrustedOrigins(env: RuntimeEnv, requestOrigin: string) {
  const requestUrl = parseUrl(requestOrigin);
  const developmentOrigins = isLocalRequestOrigin(requestUrl)
    ? [
        "exp://**",
        "exps://**",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://0.0.0.0:1420",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:5173",
        "http://192.0.0.2:1420",
      ]
    : [];

  return Array.from(
    new Set([
      requestOrigin,
      ...readCanonicalApiOrigin(env),
      ...getClientOrigins(env),
      ...DESKTOP_CLIENT_ORIGINS,
      "mobile://",
      "mobile://*",
      ...developmentOrigins,
    ]),
  );
}

function isExpoDevelopmentOrigin(url: URL) {
  return (
    (url.protocol === "exp:" || url.protocol === "exps:") &&
    isLocalDevelopmentHost(url.hostname)
  );
}

export function isLocalRequestOrigin(url: URL | null) {
  return !!url && isLocalDevelopmentHost(url.hostname);
}

export function isLocalDevelopmentHost(hostname: string) {
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "192.0.0.2" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return true;
  }

  if (hostname.startsWith("10.")) {
    return true;
  }

  if (hostname.startsWith("192.168.")) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,2})\./);

  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);

  return secondOctet >= 16 && secondOctet <= 31;
}

export function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function getStringEnv(env: RuntimeEnv, key: string) {
  const value = env[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getRequiredStringEnv(env: RuntimeEnv, key: string) {
  const value = getStringEnv(env, key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
