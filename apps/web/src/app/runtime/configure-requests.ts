import { NetworkUnavailableError } from "@/platform/network/api"
import { installRequestPolicy, type RequestObservation } from "@/platform/network/request-policy"
import { applyDemoReadOverlay, interceptDemoMutation } from "@/features/demo/transport"

/** Install before startup work or rendering can issue feature requests. */
export function configureApplicationRequests() {
  installRequestPolicy({
    intercept(path, method, body) {
      const demo = interceptDemoMutation(path, method, body)
      if (demo.handled) return demo
      return { handled: false }
    },
    observe: observeDesktopConnectivity,
    transformResponse: applyDemoReadOverlay,
  })
}

function observeDesktopConnectivity(event: RequestObservation) {
  if (event.type === "network-error") {
    throw new NetworkUnavailableError(event.error instanceof Error ? event.error.message : undefined)
  }
  // Any HTTP response proves reachability, including authorization and 5xx errors.
  if (event.status === 401) window.dispatchEvent(new Event("zilobase:authentication-required"))
}
