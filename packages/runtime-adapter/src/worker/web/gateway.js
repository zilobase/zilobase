const API_PREFIX = "/api";
const COLLABORATION_PATH = "/collaboration";
const DATABASE_COLLABORATION_PATH = "/database-collaboration";
const POSTHOG_PROXY_PREFIX = "/ingest";
const API_PATH_PREFIXES = [
  "/agents",
  "/session",
  "/sign-in",
  "/sign-up",
  "/sign-out",
  "/email-otp",
  "/workspace",
  "/workspaces",
  "/search",
  "/pages",
  "/databases",
  "/demo",
  "/images",
  "/user-settings",
];

export function createWebGateway(options) {
  const apiOrigin = options?.apiOrigin;
  const demo = options?.demo ?? null;
  const demoFrameAncestors = demo?.frameAncestors ?? ["'self'"];
  const sharedCookieDomain = options?.sharedCookieDomain ?? null;
  const posthogProxy = options?.posthogProxy ?? false;
  if (!apiOrigin) throw new Error("createWebGateway requires apiOrigin");
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const demoOrigin = demo ? url.hostname === demo.host : false;

      if (
        posthogProxy &&
        (url.pathname === POSTHOG_PROXY_PREFIX ||
          url.pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`))
      ) {
        return proxyPostHogRequest(request, env);
      }

      if (
        isApiRoute(url.pathname) ||
        url.pathname === COLLABORATION_PATH ||
        url.pathname === DATABASE_COLLABORATION_PATH
      ) {
        if (
          demoOrigin &&
          !["GET", "HEAD", "OPTIONS"].includes(request.method)
        ) {
          return demoReadOnlyResponse();
        }
        if (
          demoOrigin &&
          (url.pathname === COLLABORATION_PATH ||
            url.pathname === DATABASE_COLLABORATION_PATH)
        ) {
          return demoReadOnlyResponse();
        }
        return proxyApiRequest(request, env, { apiOrigin, demo, demoOrigin, sharedCookieDomain });
      }

      if (
        request.method === "GET" &&
        request.headers.get("accept")?.includes("text/html") &&
        isSpaRoute(url.pathname)
      ) {
        const response = await env.ASSETS.fetch(
          new Request(new URL("/index.html", url), request),
        );
        return demoOrigin ? applyDemoSecurityHeaders(response, demoFrameAncestors) : response;
      }

      const response = await env.ASSETS.fetch(request);
      if (
        request.method === "GET" &&
        request.headers.get("accept")?.includes("text/html") &&
        response.status === 404
      ) {
        const fallback = await env.ASSETS.fetch(
          new Request(new URL("/index.html", url), request),
        );
        return demoOrigin ? applyDemoSecurityHeaders(fallback, demoFrameAncestors) : fallback;
      }
      return demoOrigin ? applyDemoSecurityHeaders(response, demoFrameAncestors) : response;
    },
  };
}

async function proxyPostHogRequest(request, env) {
  if (!["GET", "HEAD", "POST"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405 });
  }
  const sourceUrl = new URL(request.url);
  const assetRequest = sourceUrl.pathname.startsWith("/ingest/static/");
  const configuredHost = assetRequest
    ? env.POSTHOG_ASSET_HOST
    : env.POSTHOG_HOST;
  const targetOrigin = readPostHogOrigin(configuredHost);
  if (!targetOrigin) return new Response("Not found", { status: 404 });

  const targetUrl = new URL(
    sourceUrl.pathname.slice(POSTHOG_PROXY_PREFIX.length) + sourceUrl.search,
    targetOrigin,
  );
  const headers = new Headers(request.headers);
  for (const header of ["authorization", "cookie", "x-api-key"]) {
    headers.delete(header);
  }

  return fetch(new Request(new Request(targetUrl, request), { headers }));
}

function readPostHogOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function proxyApiRequest(request, env, { apiOrigin, demo, demoOrigin, sharedCookieDomain }) {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, apiOrigin);
  const targetRequest = buildTargetRequest(targetUrl, request, { demo, demoOrigin });
  const response = env.API_SERVICE
    ? await env.API_SERVICE.fetch(targetRequest)
    : await fetch(targetRequest);

  if (response.status === 101) {
    return response;
  }

  return rewriteApiResponse(response, { demoOrigin, sharedCookieDomain });
}

function buildTargetRequest(targetUrl, request, { demo, demoOrigin }) {
  const headers = new Headers(request.headers);
  const demoHeader = demo?.header ?? "x-zilobase-demo";
  if (!demoOrigin) {
    headers.delete(demoHeader);
    return new Request(new Request(targetUrl, request), { headers });
  }

  for (const header of [
    "authorization",
    "cookie",
    "x-api-key",
    "x-mobile-auth-cookie",
  ]) {
    headers.delete(header);
  }
  headers.set(demoHeader, "1");
  return new Request(new Request(targetUrl, request), { headers });
}

function rewriteApiResponse(response, { demoOrigin, sharedCookieDomain }) {
  const headers = new Headers(response.headers);
  const setCookieHeaders = getSetCookieHeaders(headers);
  headers.delete("set-cookie");
  if (!demoOrigin && sharedCookieDomain) {
    for (const cookie of setCookieHeaders) {
      headers.append("set-cookie", shareCookie(cookie, sharedCookieDomain));
    }
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function applyDemoSecurityHeaders(response, frameAncestors) {
  const headers = new Headers(response.headers);
  if (headers.get("content-type")?.includes("text/html")) {
    headers.delete("x-frame-options");
    headers.set(
      "content-security-policy",
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors ${frameAncestors.join(" ")}; base-uri 'self'; form-action 'self'`,
    );
    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("x-content-type-options", "nosniff");
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function demoReadOnlyResponse() {
  return Response.json(
    {
      code: "DEMO_READ_ONLY",
      error: "Changes are disabled in the hosted demo.",
    },
    { status: 403 },
  );
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function shareCookie(cookie, sharedCookieDomain) {
  const withoutDomain = cookie.replace(/;\s*Domain=[^;]+/gi, "");
  return `${withoutDomain}; Domain=${sharedCookieDomain}`;
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
  if (pathname === "/") return false;
  return !pathname.split("/").pop()?.includes(".");
}
