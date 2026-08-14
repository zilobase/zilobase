export type RuntimeEnv = Record<string, unknown>;

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

  if (getClientOrigins(env).includes(origin)) {
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
    new Set([requestOrigin, ...getClientOrigins(env), "mobile://", "mobile://*", ...developmentOrigins]),
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
