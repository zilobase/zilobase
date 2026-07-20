// LOCAL enterprise composition for dev/self-host runtime.
//
// This mirrors `@zilobase/ee` (packages/auth-sso) but lives inside the server so
// it resolves `@better-auth/sso` cleanly from apps/server/node_modules (the EE
// repo is a sibling and can't see the nested plugin during local dev). The
// canonical packaging home is still `zilobase-ee`; the Docker/cloud build bundles
// that in. The logic here is intentionally identical: [license gate, sso()].
import { sso } from "@better-auth/sso";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { getEntitlements } from "./entitlements";

/** Paths the Better Auth SSO plugin owns (relative to the auth base path). */
function isGatedSsoPath(path: string): boolean {
  return (
    path === "/sso" ||
    path.startsWith("/sso/") ||
    path.startsWith("/sign-in/sso")
  );
}

/** Blocks SSO routes unless the active license includes `sso.saml`. */
function licenseGatePlugin() {
  return {
    id: "zilobase-license-gate",
    hooks: {
      before: [
        {
          matcher: (c: { path: string }) => isGatedSsoPath(c.path),
          handler: createAuthMiddleware(async () => {
            if (!getEntitlements().has("sso.saml")) {
              throw new APIError("FORBIDDEN", {
                code: "upgrade_required",
                message: "SSO requires an enterprise license.",
              });
            }
          }),
        },
      ],
    },
  };
}

/** Better Auth plugins contributed by the Enterprise edition. */
export function enterprisePlugins(): unknown[] {
  return [licenseGatePlugin(), sso()];
}
