import posthog, { type CaptureResult } from "posthog-js";

const projectToken = import.meta.env.VITE_POSTHOG_KEY?.trim();
const host = import.meta.env.VITE_POSTHOG_HOST?.trim();
const uiHost = import.meta.env.VITE_POSTHOG_UI_HOST?.trim();
const sessionReplayEnabled =
  import.meta.env.VITE_POSTHOG_SESSION_REPLAY?.trim() === "true";

let configuredPosthog: typeof posthog | null = null;

if (projectToken && host) {
  posthog.init(projectToken, {
    api_host: host,
    ...(uiHost ? { ui_host: uiHost } : {}),
    defaults: "2026-08-30",
    autocapture: {
      capture_copied_text: false,
      css_selector_ignorelist: [
        ".ph-no-autocapture",
        "[data-ph-no-autocapture]",
        "[contenteditable]",
      ],
      dom_event_allowlist: ["click", "change", "submit"],
      element_allowlist: ["a", "button", "form", "input", "select"],
      element_attribute_ignorelist: [
        "aria-label",
        "data-value",
        "placeholder",
        "title",
        "value",
      ],
    },
    before_send: sanitizeCapture,
    capture_dead_clicks: true,
    capture_exceptions: {
      capture_console_errors: false,
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
    },
    capture_heatmaps: true,
    capture_pageleave: true,
    capture_pageview: "history_change",
    capture_performance: {
      network_timing: true,
      web_vitals: true,
      web_vitals_attribution: ["INP", "LCP"],
    },
    custom_personal_data_properties: [
      "content",
      "email",
      "invitation",
      "name",
      "token",
    ],
    disable_capture_url_hashes: true,
    disable_session_recording: !sessionReplayEnabled,
    mask_all_text: true,
    mask_personal_data_properties: true,
    person_profiles: "identified_only",
    respect_dnt: true,
    session_recording: {
      blockSelector: "[data-ph-no-capture], .ph-no-capture, canvas, img, video",
      captureCanvas: { recordCanvas: false },
      captureJsonLd: false,
      maskAllInputs: true,
      maskTextSelector: "*",
      recordBody: false,
      recordHeaders: false,
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: stripUrlDetails(request.name),
        requestBody: null,
        requestHeaders: undefined,
        responseBody: null,
        responseHeaders: undefined,
      }),
    },
  });
  configuredPosthog = posthog;
} else if (projectToken || host) {
  console.warn(
    "PostHog is disabled because both VITE_POSTHOG_KEY and VITE_POSTHOG_HOST are required.",
  );
}

export function captureProductException(
  error: unknown,
  properties: Record<string, boolean | number | string | null> = {},
) {
  if (!configuredPosthog) return;
  const normalizedError =
    error instanceof Error ? error : new Error("Unknown application error");
  configuredPosthog.captureException(normalizedError, properties);
}

function sanitizeCapture(capture: CaptureResult | null) {
  if (!capture) return null;

  for (const property of [
    "$current_url",
    "$external_click_url",
    "$initial_current_url",
    "$referrer",
    "$session_entry_url",
  ]) {
    const value = capture.properties[property];
    if (typeof value === "string") {
      capture.properties[property] = stripUrlDetails(value);
    }
  }

  return capture;
}

function stripUrlDetails(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

export default configuredPosthog;
