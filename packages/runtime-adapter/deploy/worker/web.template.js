// Community web gateway entry template.
// Copy next to web.template.jsonc, point `main` at this file, and deploy.
// Pass your own origins; no hosted hosts are baked in.
import { createWebGateway } from "@zilobase/runtime-adapter/worker/web/gateway";

const gateway = createWebGateway({
  apiOrigin: "<API_ORIGIN>",
  demo: null,
  sharedCookieDomain: null,
  posthogProxy: false,
});

export default {
  fetch: gateway.fetch,
};
