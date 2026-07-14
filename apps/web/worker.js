const API_ORIGIN = "https://api.notelab.io";
const API_PREFIX = "/api";
const RAW_API_PREFIX = "/api/_raw";
const COLLABORATION_PATH = "/collaboration";
const DATABASE_COLLABORATION_PATH = "/database-collaboration";
const API_PATH_PREFIXES = [
  "/agents",
  "/session",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/email-otp",
  "/workspace",
  "/search",
  "/pages",
  "/databases",
  "/images",
  "/user-settings",
];

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    if (
      isApiRoute(url.pathname) ||
      url.pathname === COLLABORATION_PATH ||
      url.pathname === DATABASE_COLLABORATION_PATH
    ) {
      return proxyApiRequest(request, env);
    }

    if (
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html") &&
      isSpaRoute(url.pathname)
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    const response = await env.ASSETS.fetch(request);

    if (
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html") &&
      response.status === 404
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    return response;
  },
};

async function proxyApiRequest(request, env) {
  const sourceUrl = new URL(request.url);
  const targetPathname = getApiTargetPathname(sourceUrl.pathname);
  const targetUrl = new URL(targetPathname + sourceUrl.search, API_ORIGIN);
  const targetRequest = new Request(targetUrl, request);
  const response = env.API_SERVICE
    ? await env.API_SERVICE.fetch(targetRequest)
    : await fetch(targetRequest);

  return rewriteApiResponseCookies(response);
}

function getApiTargetPathname(pathname) {
  if (pathname === RAW_API_PREFIX) {
    return API_PREFIX;
  }

  if (pathname.startsWith(`${RAW_API_PREFIX}/`)) {
    return pathname.slice(RAW_API_PREFIX.length);
  }

  if (pathname === API_PREFIX) {
    return "/";
  }

  if (pathname.startsWith(`${API_PREFIX}/`)) {
    return pathname.slice(API_PREFIX.length);
  }

  return pathname;
}

function rewriteApiResponseCookies(response) {
  const headers = new Headers(response.headers);
  const setCookieHeaders = getSetCookieHeaders(headers);

  if (setCookieHeaders.length === 0) {
    return response;
  }

  headers.delete("set-cookie");

  for (const cookie of setCookieHeaders) {
    headers.append("set-cookie", rewriteApiCookieDomain(cookie));
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");

  return setCookie ? [setCookie] : [];
}

function rewriteApiCookieDomain(cookie) {
  return cookie.replace(/;\s*Domain=api\.notelab\.io/gi, "");
}

function isApiRoute(pathname) {
  return (
    pathname === API_PREFIX ||
    pathname.startsWith(`${API_PREFIX}/`) ||
    API_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

function isSpaRoute(pathname) {
  if (pathname === "/") {
    return false;
  }

  return !pathname.split("/").pop()?.includes(".");
}
