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

  const user = c.get("user");

  if (!user) {
    const loginUrl = new URL("/login", getCanonicalWebOrigin(c.env));
    loginUrl.searchParams.set("returnTo", c.req.url);

    return c.html(renderSignInPage(loginUrl.toString()));
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

        const auth = createAuth(c.env, c.req.raw);
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

function renderSignInPage(loginUrl: string) {
  return pageShell(
    "Sign in to connect Zilobase Desktop",
    `<p>Continue with this server's password, email code, Google, or configured SSO sign-in.</p><a class="button" href="${escapeHtml(loginUrl)}">Continue to sign in</a>`,
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px system-ui;margin:0;display:grid;min-height:100vh;place-items:center;background:#0d0d0f;color:#fff}main{box-sizing:border-box;max-width:32rem;padding:2rem}p{color:#b6b6bd;line-height:1.55}.button,.secondary{border:0;border-radius:.5rem;cursor:pointer;display:inline-block;font:inherit;padding:.7rem 1rem;text-decoration:none}.button{background:#fff;color:#111}.secondary{background:#29292e;color:#fff}.actions{display:flex;gap:.75rem;margin-top:1.5rem}.server-label{display:block;font-size:.8rem;margin-top:1.5rem;color:#b6b6bd}input{box-sizing:border-box;width:100%;margin-top:.4rem;border:1px solid #45454d;border-radius:.5rem;background:#19191d;color:#fff;font:inherit;padding:.7rem}.hint{font-size:.8rem}</style></head><body><main><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

function desktopPageCsp() {
  return "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
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
