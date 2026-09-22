import type { ZilobaseDesktopBridge } from "../../../../desktop/electron/shared/bridge";

declare global {
  interface Window {
    zilobaseDesktop?: ZilobaseDesktopBridge;
  }
}

export function isElectronDesktop(): boolean {
  return typeof window !== "undefined" && window.zilobaseDesktop?.apiVersion === 1;
}

export function isDesktopApp(): boolean {
  return isElectronDesktop();
}

export function desktopBridge(): ZilobaseDesktopBridge {
  if (typeof window === "undefined" || window.zilobaseDesktop?.apiVersion !== 1) {
    throw new Error("Desktop bridge unavailable");
  }
  return window.zilobaseDesktop;
}
