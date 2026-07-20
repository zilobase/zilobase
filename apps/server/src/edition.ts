/**
 * Edition composition seam.
 *
 * When `ZILOBASE_EDITION=enterprise`, load the enterprise plugin contributions
 * and expose them to `auth.ts`. In the Community build this stays empty and the
 * app runs unchanged. The license tier still decides Professional vs Enterprise
 * at runtime — the EE plugins self-gate against `getEntitlements()`.
 *
 * Resolution order:
 *   1. `@zilobase/ee` — the real private package (Enterprise Docker/cloud build,
 *      where both repos are installed together via `npm ci`).
 *   2. `./edition-enterprise` — a local dev fallback that resolves
 *      `@better-auth/sso` from the server's own node_modules, so SSO can be
 *      exercised with `npm run dev` without linking the sibling repo.
 */
import { getEntitlements } from "./entitlements";

let eePlugins: unknown[] = [];
let initialized = false;

export async function initEdition(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (process.env.ZILOBASE_EDITION !== "enterprise") return;

  // 1. Real package (indirect specifier so the Community build never tries to
  //    statically resolve a package that is only present in the EE build).
  try {
    const specifier = "@zilobase/ee";
    const mod = (await import(specifier)) as {
      registerEnterprise: (ctx: {
        getEntitlements: typeof getEntitlements;
      }) => { plugins: unknown[] };
    };
    eePlugins = mod.registerEnterprise({ getEntitlements }).plugins ?? [];
    console.info(
      `[edition] Enterprise features loaded from @zilobase/ee (${eePlugins.length} plugin(s)).`,
    );
    return;
  } catch {
    // fall through to the local dev composition
  }

  // 2. Local dev fallback.
  try {
    const { enterprisePlugins } = await import("./edition-enterprise");
    eePlugins = enterprisePlugins();
    console.info(
      `[edition] Enterprise features loaded from local composition (${eePlugins.length} plugin(s)).`,
    );
  } catch (error) {
    console.warn(
      "[edition] ZILOBASE_EDITION=enterprise but no enterprise composition is available; running Community.",
      error,
    );
  }
}

/** Better Auth plugins contributed by the Enterprise edition (empty in Community). */
export function getEEPlugins(): unknown[] {
  return eePlugins;
}
