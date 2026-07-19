import { getEntitlements } from "./entitlements";

/**
 * Edition composition seam.
 *
 * The OSS core never imports `zilobase-ee` statically. When
 * `ZILOBASE_EDITION=enterprise` and the private `@zilobase/ee` package is
 * installed (Enterprise build), we load it through a guarded dynamic import and
 * collect its Better Auth plugin contributions. In the Community build the
 * package is absent, the import fails, and the core runs unchanged.
 *
 * The license tier still decides Professional vs Enterprise at runtime — the EE
 * plugins self-gate against `getEntitlements()`.
 */
let eePlugins: unknown[] = [];
let initialized = false;

export async function initEdition(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (process.env.ZILOBASE_EDITION !== "enterprise") return;

  try {
    // Indirect specifier so the OSS build does not statically resolve (and fail
    // to typecheck on) a package that is only present in the Enterprise build.
    const specifier = "@zilobase/ee";
    const mod: { registerEnterprise: (ctx: { getEntitlements: typeof getEntitlements }) => { plugins: unknown[] } } =
      await import(specifier);
    eePlugins = mod.registerEnterprise({ getEntitlements }).plugins ?? [];
    console.info(`[edition] Enterprise features loaded (${eePlugins.length} plugin(s)).`);
  } catch (error) {
    console.warn(
      "[edition] ZILOBASE_EDITION=enterprise but @zilobase/ee is unavailable; running Community.",
      error,
    );
  }
}

/** Better Auth plugins contributed by the Enterprise edition (empty in Community). */
export function getEEPlugins(): unknown[] {
  return eePlugins;
}
