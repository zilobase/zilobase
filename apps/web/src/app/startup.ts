import { NetworkUnavailableError } from "@/platform/network/api";
import { installRequestPolicy, type RequestObservation } from "@/platform/network/request-policy";
import { applyDemoReadOverlay, interceptDemoRequest } from "@/app/demo/transport";
import { installDesktopServerSwitch } from "@/platform/server/operations/desktop-server-switch";
import { switchDesktopServerSession } from "./desktop-session";
import { isDesktopApp } from "@/platform/desktop/native";
import { createNativeMeetingCaptureRuntime } from "@/platform/desktop/meetings/native-capture-runtime";
import { BrowserMeetingCapture } from "@/platform/browser/meetings/browser-meeting-capture";
import { createBrowserMeetingCaptureRuntime } from "@/platform/browser/meetings/browser-capture-runtime";
import { installMeetingCaptureRuntime } from "@/platform/meetings/capture-runtime";

export function configureApplicationSessions() {
  installDesktopServerSwitch(switchDesktopServerSession);
}

/** Install before startup work or rendering can issue feature requests. */
export function configureApplicationRequests() {
  installRequestPolicy({
    intercept(path, method, body) {
      const demo = interceptDemoRequest(path, method, body);
      if (demo.handled) return demo;
      return { handled: false };
    },
    observe: observeDesktopConnectivity,
    transformResponse: applyDemoReadOverlay,
  });
}

function observeDesktopConnectivity(event: RequestObservation) {
  if (event.type === "network-error") {
    throw new NetworkUnavailableError(
      event.error instanceof Error ? event.error.message : undefined,
    );
  }
  // Any HTTP response proves reachability, including authorization and 5xx errors.
  if (event.status === 401) {
    window.dispatchEvent(new Event("zilobase:authentication-required"));
  }
}

export function configureApplicationMeetingCapture() {
  installMeetingCaptureRuntime(
    isDesktopApp()
      ? createNativeMeetingCaptureRuntime()
      : createBrowserMeetingCaptureRuntime(new BrowserMeetingCapture()),
  );
}
