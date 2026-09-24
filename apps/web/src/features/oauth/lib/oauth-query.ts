const oauthSearchKeys = [
  "client_id",
  "scope",
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
  "response_type",
  "nonce",
  "prompt",
  "claims",
  "oauth_query",
  "sig",
  "exp",
] as const;

export function readOAuthQuery(search = window.location.search) {
  const params = new URLSearchParams(search);
  const explicit = params.get("oauth_query");
  if (explicit) {
    return explicit;
  }

  if (!params.get("client_id")) {
    return null;
  }

  return params.toString();
}

export function isOAuthLoginSearch(search: Record<string, unknown>) {
  return typeof search.client_id === "string" || typeof search.oauth_query === "string";
}

export function pickOAuthSearch(search: Record<string, unknown>) {
  const next: Record<string, string> = {};

  for (const key of oauthSearchKeys) {
    const value = search[key];
    if (typeof value === "string" && value.length > 0 && value.length < 4000) {
      next[key] = value;
    }
  }

  return next;
}
