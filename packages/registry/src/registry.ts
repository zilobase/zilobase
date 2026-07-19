import type { PortKey } from "@zilobase/core-ports";

export interface RegisterOptions {
  /** Allow replacing an implementation already registered for this port. */
  readonly override?: boolean;
}

/**
 * A small dependency-injection surface for edition composition.
 *
 * The Community core registers default implementations for every port; the
 * private Enterprise bundle (`zilobase-ee`) registers its own with
 * `{ override: true }`. Feature code resolves a port and never learns which
 * edition supplied it — so swapping an implementation touches exactly one
 * registration site.
 */
export interface Registry {
  register<T>(key: PortKey<T>, impl: T, options?: RegisterOptions): void;
  resolve<T>(key: PortKey<T>): T;
  tryResolve<T>(key: PortKey<T>): T | undefined;
  has<T>(key: PortKey<T>): boolean;
}

export function createRegistry(): Registry {
  const impls = new Map<string, unknown>();

  return {
    register<T>(key: PortKey<T>, impl: T, options?: RegisterOptions): void {
      if (impls.has(key.id) && !options?.override) {
        throw new Error(
          `Port "${key.id}" already has an implementation. Pass { override: true } to replace it.`,
        );
      }
      impls.set(key.id, impl);
    },
    resolve<T>(key: PortKey<T>): T {
      const impl = impls.get(key.id);
      if (impl === undefined) {
        throw new Error(`No implementation registered for port "${key.id}".`);
      }
      return impl as T;
    },
    tryResolve<T>(key: PortKey<T>): T | undefined {
      return impls.get(key.id) as T | undefined;
    },
    has<T>(key: PortKey<T>): boolean {
      return impls.has(key.id);
    },
  };
}
