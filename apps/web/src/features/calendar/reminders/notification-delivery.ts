import { isDesktopApp } from "@/platform/environment";
import {
  isNotificationPermissionGranted,
  requestNotificationPermission,
  sendNotification,
} from "@/platform/desktop/native";
export async function requestCalendarNotificationPermission() {
  if (isDesktopApp()) return requestNotificationPermission();
  return typeof Notification === "undefined" ? "denied" : Notification.requestPermission();
}
export async function deliverCalendarSystemNotification(title: string, body: string, tag: string) {
  if (isDesktopApp()) {
    if (await isNotificationPermissionGranted()) await sendNotification({ title, body });
  } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(title, { body, tag });
  }
}
