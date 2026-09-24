import type { DesktopServerReplacementRequest } from "./desktop-server-replacement-core";

export type { DesktopServerReplacementRequest };

type ReplacementListener = (request: DesktopServerReplacementRequest) => void;

let replacementListener: ReplacementListener | null = null;
const queuedRequests: DesktopServerReplacementRequest[] = [];

export function requestDesktopServerReplacement(request: DesktopServerReplacementRequest) {
  if (replacementListener) replacementListener(request);
  else queuedRequests.push(request);
}

export function subscribeDesktopServerReplacement(listener: ReplacementListener) {
  replacementListener = listener;
  for (const request of queuedRequests.splice(0)) listener(request);
  return () => {
    if (replacementListener === listener) replacementListener = null;
  };
}
