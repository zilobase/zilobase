// Community Worker environment bindings for `@zilobase/runtime-adapter/worker`.
// Mirrors the shape of the generated `worker-configuration.d.ts` in hosted
// builds without any hosted credentials, hostnames, or placement values.
// Hosted deployments generate their own bindings file via `wrangler types`.
import type { OutboundEmailMessage } from "./contracts";

declare global {
  namespace Cloudflare {
    interface Env extends Record<string, unknown> {}
  }

  interface CloudflareBindings extends Record<string, unknown> {
    EMAIL?: {
      send(
        message: Pick<OutboundEmailMessage, "html" | "subject" | "text"> & {
          from: EmailAddress | string;
          to: EmailAddress | string;
        },
      ): Promise<void>;
    };
  }
}

export {};
