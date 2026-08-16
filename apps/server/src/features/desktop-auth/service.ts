import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { isLoopbackHost } from "../../config";

export const DESKTOP_AUTH_CLIENT_ID = "zilobase-desktop";
export const DESKTOP_AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const DESKTOP_CONSENT_TOKEN_TTL_MS = 10 * 60 * 1000;
export const DESKTOP_AUTH_REQUEST_MAX_BYTES = 16 * 1024;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type DesktopAuthorizationRequest = {
  clientId: typeof DESKTOP_AUTH_CLIENT_ID;
  codeChallenge: string;
  redirectUri: string;
  state: string;
};

export type DesktopTokenRequest = {
  clientId: typeof DESKTOP_AUTH_CLIENT_ID;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export type ConsumedDesktopAuthorizationCode = {
  activeWorkspaceId: string | null;
  userId: string;
};

export type DesktopAuthorizationCodeRepository = {
  consume(input: {
    codeChallenge: string;
    codeHash: string;
    now: Date;
    redirectUri: string;
  }): Promise<ConsumedDesktopAuthorizationCode | null>;
};

export class DesktopAuthorizationError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "unsupported_response_type"
      | "server_error",
    message: string,
  ) {
    super(message);
    this.name = "DesktopAuthorizationError";
  }
}

export function parseDesktopAuthorizationRequest(
  parameters: URLSearchParams,
): DesktopAuthorizationRequest {
  const responseType = readSingleParameter(parameters, "response_type");

  if (responseType !== "code") {
    throw new DesktopAuthorizationError(
      "unsupported_response_type",
      "Desktop authorization requires the authorization-code response type.",
    );
  }

  const clientId = readSingleParameter(parameters, "client_id");
  const redirectUri = readSingleParameter(parameters, "redirect_uri");
  const state = readSingleParameter(parameters, "state");
  const codeChallenge = readSingleParameter(parameters, "code_challenge");
  const challengeMethod = readSingleParameter(
    parameters,
    "code_challenge_method",
  );

  if (clientId !== DESKTOP_AUTH_CLIENT_ID) {
    throw invalidRequest("The desktop client identifier is invalid.");
  }
  if (!isValidDesktopRedirectUri(redirectUri)) {
    throw invalidRequest("The desktop callback URL is invalid.");
  }
  if (!isBoundedBase64Url(state, 32, 512)) {
    throw invalidRequest("The desktop authorization state is invalid.");
  }
  if (
    challengeMethod !== "S256" ||
    !isBoundedBase64Url(codeChallenge, 43, 128)
  ) {
    throw invalidRequest("A valid S256 PKCE challenge is required.");
  }

  return {
    clientId: DESKTOP_AUTH_CLIENT_ID,
    codeChallenge: codeChallenge!,
    redirectUri: redirectUri!,
    state: state!,
  };
}

export function parseDesktopTokenRequest(
  parameters: URLSearchParams,
): DesktopTokenRequest {
  if (readSingleParameter(parameters, "grant_type") !== "authorization_code") {
    throw invalidRequest("The desktop token grant type is invalid.");
  }

  const clientId = readSingleParameter(parameters, "client_id");
  const code = readSingleParameter(parameters, "code");
  const redirectUri = readSingleParameter(parameters, "redirect_uri");
  const codeVerifier = readSingleParameter(parameters, "code_verifier");

  if (clientId !== DESKTOP_AUTH_CLIENT_ID) {
    throw invalidRequest("The desktop client identifier is invalid.");
  }
  if (!isValidDesktopRedirectUri(redirectUri)) {
    throw invalidRequest("The desktop callback URL is invalid.");
  }
  if (!isBoundedBase64Url(code, 32, 512)) {
    throw invalidRequest("The desktop authorization code is invalid.");
  }
  if (!isBoundedBase64Url(codeVerifier, 43, 128)) {
    throw invalidRequest("The PKCE verifier is invalid.");
  }

  return {
    clientId: DESKTOP_AUTH_CLIENT_ID,
    code: code!,
    codeVerifier: codeVerifier!,
    redirectUri: redirectUri!,
  };
}

export function isValidDesktopRedirectUri(value: string | undefined) {
  if (!value || value.length > 2048) return false;

  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" &&
      isLoopbackHost(url.hostname) &&
      url.port.length > 0 &&
      url.pathname === "/oauth/callback" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function createDesktopAuthorizationCode() {
  return randomBytes(32).toString("base64url");
}

export function createDesktopConsentToken(
  request: DesktopAuthorizationRequest,
  userId: string,
  secret: string,
  now = new Date(),
) {
  const expiresAt = now.getTime() + DESKTOP_CONSENT_TOKEN_TTL_MS;
  const encodedExpiry = expiresAt.toString(36);
  const signature = signDesktopConsent(request, userId, secret, encodedExpiry);

  return `${encodedExpiry}.${signature}`;
}

export function verifyDesktopConsentToken(
  token: string | undefined,
  request: DesktopAuthorizationRequest,
  userId: string,
  secret: string,
  now = new Date(),
) {
  const match = token?.match(/^([0-9a-z]+)\.([A-Za-z0-9_-]{43})$/);
  if (!match || !secret) return false;

  const [, encodedExpiry, signature] = match;
  const expiresAt = Number.parseInt(encodedExpiry, 36);

  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now.getTime()) {
    return false;
  }

  const expected = Buffer.from(
    signDesktopConsent(request, userId, secret, encodedExpiry),
    "ascii",
  );
  const received = Buffer.from(signature, "ascii");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export function hashDesktopAuthorizationCode(code: string) {
  return createHash("sha256").update(code, "utf8").digest("base64url");
}

export function derivePkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function consumeDesktopAuthorizationCode(
  request: DesktopTokenRequest,
  repository: DesktopAuthorizationCodeRepository,
  now = new Date(),
) {
  return repository.consume({
    codeChallenge: derivePkceChallenge(request.codeVerifier),
    codeHash: hashDesktopAuthorizationCode(request.code),
    now,
    redirectUri: request.redirectUri,
  });
}

export function buildDesktopCallbackUrl(
  request: Pick<DesktopAuthorizationRequest, "redirectUri" | "state">,
  issuer: string,
  result: { code: string } | { error: string },
) {
  const callback = new URL(request.redirectUri);

  callback.searchParams.set("state", request.state);
  callback.searchParams.set("iss", issuer);
  if ("code" in result) {
    callback.searchParams.set("code", result.code);
  } else {
    callback.searchParams.set("error", result.error);
  }

  return callback.toString();
}

function readSingleParameter(parameters: URLSearchParams, key: string) {
  const values = parameters.getAll(key);

  return values.length === 1 ? values[0] : undefined;
}

function isBoundedBase64Url(
  value: string | undefined,
  minimum: number,
  maximum: number,
) {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    BASE64URL_PATTERN.test(value)
  );
}

function invalidRequest(message: string) {
  return new DesktopAuthorizationError("invalid_request", message);
}

function signDesktopConsent(
  request: DesktopAuthorizationRequest,
  userId: string,
  secret: string,
  encodedExpiry: string,
) {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        encodedExpiry,
        request.clientId,
        request.codeChallenge,
        request.redirectUri,
        request.state,
        userId,
      ]),
      "utf8",
    )
    .digest("base64url");
}
