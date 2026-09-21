import { isDesktopApp } from "@/platform/desktop/native";
import { createNativeMeetingCaptureRuntime } from "@/features/desktop/meetings";
import { BrowserMeetingCapture } from "@/features/meetings/capture";
import { createBrowserMeetingCaptureRuntime } from "@/features/meetings/capture/browser-capture-runtime";
import { installMeetingCaptureRuntime } from "@/features/meetings/capture/capture-runtime";

export function configureApplicationMeetingCapture() {
  installMeetingCaptureRuntime(
    isDesktopApp()
      ? createNativeMeetingCaptureRuntime()
      : createBrowserMeetingCaptureRuntime(new BrowserMeetingCapture()),
  );
}
