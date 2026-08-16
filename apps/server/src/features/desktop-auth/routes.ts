import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";

import { createAuth } from "../../auth";
import {
  getCanonicalApiOrigin,
  getCanonicalWebOrigin,
  getRequiredStringEnv,
} from "../../config";
import { db, runWithDb, runWithDbEnv, type Database } from "../../db";
import { desktopAuthorizationCode } from "../../db/schema";
import { getZilobaseDiscoveryDocument } from "../instance/service";
import type { AppBindings } from "../../types";
import {
  buildDesktopCallbackUrl,
  consumeDesktopAuthorizationCode,
  createDesktopAuthorizationCode,
  createDesktopConsentToken,
  DESKTOP_AUTH_CODE_TTL_MS,
  DESKTOP_AUTH_REQUEST_MAX_BYTES,
  DesktopAuthorizationError,
  hashDesktopAuthorizationCode,
  parseDesktopAuthorizationRequest,
  parseDesktopTokenRequest,
  verifyDesktopConsentToken,
  type DesktopAuthorizationRequest,
} from "./service";

export const desktopAuthRoutes = new Hono<AppBindings>();

desktopAuthRoutes.get("/desktop", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", desktopPageCsp());
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");

  const discovery = await getZilobaseDiscoveryDocument(c.env);
  const connectLink = new URL("zilobase://connect");
  connectLink.searchParams.set("server", discovery.apiOrigin);

  return c.html(
    pageShell(
      `Connect to ${discovery.displayName}`,
      `<p>Use this server with the same Zilobase Desktop app used for Zilobase Cloud.</p><a class="button" href="${escapeHtml(connectLink.toString())}">Open in Zilobase Desktop</a><label class="server-label" for="server-url">Server URL</label><input id="server-url" readonly value="${escapeHtml(discovery.apiOrigin)}"><p class="hint">Copy this URL into <strong>Change server</strong> in the desktop app if the button does not open.</p>`,
    ),
  );
});

desktopAuthRoutes.get("/desktop/authorize", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", desktopPageCsp());
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");

  let authorizationRequest: DesktopAuthorizationRequest;

  try {
    authorizationRequest = parseDesktopAuthorizationRequest(
      new URL(c.req.url).searchParams,
    );
  } catch (error) {
    return renderAuthorizationError(c, error);
  }

  c.header(
    "Content-Security-Policy",
    desktopPageCsp(new URL(authorizationRequest.redirectUri).origin),
  );

  const user = c.get("user");

  if (!user) {
    const webOrigin = getCanonicalWebOrigin(c.env);
    const loginUrl = new URL("/login", webOrigin);
    loginUrl.searchParams.set("returnTo", c.req.url);
    const signupUrl = new URL("/signup", webOrigin);
    signupUrl.searchParams.set("returnTo", c.req.url);

    return c.html(
      renderSignInPage(loginUrl.toString(), signupUrl.toString()),
    );
  }

  return c.html(
    renderConsentPage(
      authorizationRequest,
      {
        email: user.email,
        name: user.name,
      },
      createDesktopConsentToken(
        authorizationRequest,
        user.id,
        getRequiredStringEnv(c.env, "BETTER_AUTH_SECRET"),
      ),
    ),
  );
});

desktopAuthRoutes.post("/desktop/authorize/consent", async (c) => {
  c.header("Cache-Control", "no-store");

  if (!isAllowedConsentOrigin(c.req.raw, c.env)) {
    return c.json({ error: "invalid_request" }, 403);
  }

  const user = c.get("user");

  if (!user) {
    return c.json({ error: "authentication_required" }, 401);
  }

  const body = await readBoundedBody(c.req.raw);

  if (!body) {
    return c.json({ error: "invalid_request" }, 400);
  }

  let authorizationRequest: DesktopAuthorizationRequest;

  try {
    authorizationRequest = parseDesktopAuthorizationRequest(
      new URLSearchParams(body),
    );
  } catch (error) {
    return renderAuthorizationError(c, error);
  }

  if (
    !verifyDesktopConsentToken(
      body.get("consent_token") ?? undefined,
      authorizationRequest,
      user.id,
      getRequiredStringEnv(c.env, "BETTER_AUTH_SECRET"),
    )
  ) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const issuer = getCanonicalApiOrigin(c.env);

  if (body.get("decision") !== "allow") {
    return c.redirect(
      buildDesktopCallbackUrl(authorizationRequest, issuer, {
        error: "access_denied",
      }),
      303,
    );
  }

  const code = createDesktopAuthorizationCode();
  const expiresAt = new Date(Date.now() + DESKTOP_AUTH_CODE_TTL_MS);

  await db.insert(desktopAuthorizationCode).values({
    id: crypto.randomUUID(),
    codeChallenge: authorizationRequest.codeChallenge,
    codeHash: hashDesktopAuthorizationCode(code),
    redirectUri: authorizationRequest.redirectUri,
    userId: user.id,
    activeWorkspaceId: c.get("session")?.activeWorkspaceId ?? null,
    expiresAt,
  });

  return c.redirect(
    buildDesktopCallbackUrl(authorizationRequest, issuer, { code }),
    303,
  );
});

desktopAuthRoutes.post("/api/auth/desktop/token", async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");

  const rawBody = await readBoundedBody(c.req.raw);

  if (!rawBody) {
    return tokenError(c, "invalid_request", 400);
  }

  let tokenRequest;

  try {
    tokenRequest = parseDesktopTokenRequest(rawBody);
  } catch (error) {
    return tokenError(
      c,
      error instanceof DesktopAuthorizationError
        ? error.code
        : "invalid_request",
      400,
    );
  }

  return runWithDbEnv(c.env, async () => {
    const now = new Date();
    const result = await db.transaction(async (transaction) =>
      runWithDb(transaction as unknown as Database, async () => {
        const authorizationCode = await consumeDesktopAuthorizationCode(
          tokenRequest,
          {
            async consume(input) {
              const [consumed] = await db
                .update(desktopAuthorizationCode)
                .set({ consumedAt: input.now })
                .where(
                  and(
                    eq(desktopAuthorizationCode.codeHash, input.codeHash),
                    eq(
                      desktopAuthorizationCode.codeChallenge,
                      input.codeChallenge,
                    ),
                    eq(desktopAuthorizationCode.redirectUri, input.redirectUri),
                    isNull(desktopAuthorizationCode.consumedAt),
                    gt(desktopAuthorizationCode.expiresAt, input.now),
                  ),
                )
                .returning({
                  activeWorkspaceId: desktopAuthorizationCode.activeWorkspaceId,
                  userId: desktopAuthorizationCode.userId,
                });

              return consumed ?? null;
            },
          },
          now,
        );

        if (!authorizationCode) return null;

        const auth = createAuth(c.env, c.req.raw, undefined, {
          editionExtension: c.get("editionExtension") ?? undefined,
        });
        const authContext = await auth.$context;
        const session = await authContext.internalAdapter.createSession(
          authorizationCode.userId,
          false,
          {
            activeWorkspaceId: authorizationCode.activeWorkspaceId,
            userAgent: "Zilobase Desktop",
          },
        );

        return { authorizationCode, session };
      }),
    );

    if (!result) {
      return tokenError(c, "invalid_grant", 400);
    }

    const discovery = await getZilobaseDiscoveryDocument(c.env);

    return c.json({
      access_token: result.session.token,
      expires_at: result.session.expiresAt.toISOString(),
      instance_id: discovery.instanceId,
      issuer: discovery.issuer,
      token_type: "Bearer",
      user: { id: result.authorizationCode.userId },
    });
  });
});

function renderAuthorizationError(c: Context<AppBindings>, error: unknown) {
  const authorizationError =
    error instanceof DesktopAuthorizationError
      ? error
      : new DesktopAuthorizationError(
          "invalid_request",
          "The desktop authorization request is invalid.",
        );

  return c.html(renderErrorPage(authorizationError.message), 400);
}

async function readBoundedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > DESKTOP_AUTH_REQUEST_MAX_BYTES
  ) {
    return null;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) return new URLSearchParams();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > DESKTOP_AUTH_REQUEST_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new URLSearchParams(
      new TextDecoder("utf-8", { fatal: true }).decode(body),
    );
  } catch {
    return null;
  }
}

function isAllowedConsentOrigin(
  request: Request,
  env: Record<string, unknown>,
) {
  const origin = request.headers.get("origin");

  return (
    origin === null ||
    origin === "null" ||
    origin === getCanonicalApiOrigin(env)
  );
}

function tokenError(c: Context<AppBindings>, error: string, status: 400) {
  return c.json({ error }, status);
}

function renderSignInPage(loginUrl: string, signupUrl: string) {
  return pageShell(
    "Sign in to your account",
    `<p>Don&apos;t have an account? <a href="${escapeHtml(signupUrl)}">Sign up</a></p><p>Continue with this server&apos;s password, email code, Google, or configured SSO sign-in.</p><a class="button" href="${escapeHtml(loginUrl)}">Sign in</a>`,
  );
}

function renderConsentPage(
  request: DesktopAuthorizationRequest,
  user: { email: string; name: string },
  consentToken: string,
) {
  const fields = new URLSearchParams({
    client_id: request.clientId,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    consent_token: consentToken,
    redirect_uri: request.redirectUri,
    response_type: "code",
    state: request.state,
  });
  const hiddenFields = Array.from(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");

  return pageShell(
    "Connect Zilobase Desktop?",
    `<p>Signed in as <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}).</p><p>This creates a separate desktop session for this server. Your password and browser session are never shared with the app.</p><form method="post" action="/desktop/authorize/consent">${hiddenFields}<div class="actions"><button class="button" name="decision" value="allow">Allow</button><button class="secondary" name="decision" value="deny">Cancel</button></div></form>`,
  );
}

function renderErrorPage(message: string) {
  return pageShell(
    "Desktop connection could not be started",
    `<p>${escapeHtml(message)}</p><p>Close this tab and try again from Zilobase Desktop.</p>`,
  );
}

function pageShell(title: string, content: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${AUTH_PAGE_STYLES}</style>
</head>
<body>
<main>
<div class="brand">${ZILOBASE_MARK}<span>Zilobase</span></div>
<div>
<h1>${escapeHtml(title)}</h1>
${content}
</div>
</main>
</body>
</html>`;
}

const ZILOBASE_MARK =
  '<svg class="logo" viewBox="0 0 248 225" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M57.6094 140H10C4.47716 140 0 135.523 0 130V95C0 89.4772 4.47715 85 10 85H112.609L57.6094 140ZM238 85C243.523 85 248 89.4772 248 95V130C248 135.523 243.523 140 238 140H135.391L190.391 85H238Z" fill="currentColor"/><rect y="170" width="248" height="55" rx="10" fill="currentColor"/><rect width="248" height="55" rx="10" fill="currentColor"/></svg>';

// Keep in sync with apps/desktop/src-tauri/src/oauth.rs AUTH_PAGE_STYLES.
const AUTH_PAGE_STYLES = `:root{color-scheme:light;--background:#fff;--foreground:oklch(0.145 0 0);--muted:oklch(0.556 0 0);--border:oklch(0.922 0 0);--input:oklch(0.922 0 0)}@media (prefers-color-scheme:dark){:root{color-scheme:dark;--background:#0d0d0f;--foreground:#fff;--muted:#71717a;--border:#1e1e1e;--input:#27272a}}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:var(--background);color:var(--foreground);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;-webkit-font-smoothing:antialiased}@media (min-width:768px){body{padding:2.5rem}}main{width:100%;max-width:24rem;display:flex;flex-direction:column;gap:1.5rem}.brand{display:flex;align-items:center;gap:.5rem;font-weight:500}.logo{display:block;height:1.75rem;width:auto;color:var(--foreground)}h1{margin:0;font-size:1.125rem;line-height:1.75rem;font-weight:600}p{margin:.25rem 0 0;font-size:.75rem;line-height:1.625;font-weight:400;color:var(--muted)}p a{color:inherit;text-decoration:underline;text-underline-offset:4px}.button,.secondary{display:flex;align-items:center;justify-content:center;width:100%;height:1.75rem;margin-top:1.5rem;padding:0 .5rem;border:0;border-radius:.375rem;font:inherit;font-size:.75rem;line-height:1.625;font-weight:500;text-decoration:none;cursor:pointer}.actions{display:flex;flex-direction:column;gap:.5rem;margin-top:1.5rem}.actions .button,.actions .secondary{margin-top:0}.button{background:#2383e2;color:#fff}.button:hover{background:#1f75c9}.secondary{background:transparent;color:var(--foreground);border:1px solid var(--border)}.server-label{display:block;margin-top:1.5rem;font-size:.75rem;line-height:1.625;font-weight:500}input{width:100%;height:1.75rem;margin-top:.375rem;padding:0 .5rem;border:1px solid var(--input);border-radius:.375rem;background:color-mix(in oklab,var(--input) 20%,transparent);color:var(--foreground);font:inherit;font-size:.75rem}.hint{margin-top:.5rem}`;

function desktopPageCsp(callbackOrigin?: string) {
  const formAction = callbackOrigin ? `'self' ${callbackOrigin}` : "'self'";

  return `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; base-uri 'none'; frame-ancestors 'none'`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
