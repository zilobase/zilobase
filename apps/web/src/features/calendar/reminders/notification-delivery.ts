import { isDesktopApp } from "@/platform/environment";
import { desktopBridge } from "@/platform/desktop/native";
export async function requestCalendarNotificationPermission() {
  if (isDesktopApp()) return desktopBridge().notifications.requestPermission();
  return typeof Notification === "undefined" ? "denied" : Notification.requestPermission();
}
export async function deliverCalendarSystemNotification(title: string, body: string, tag: string) {
  if (isDesktopApp()) {
    if (Notification.permission === "granted") await desktopBridge().notifications.show({ title, body });
  } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body, tag });
  }
}
