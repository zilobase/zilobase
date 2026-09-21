import { installDesktopServerSwitch } from "@/features/desktop/server/desktop-server-switch"
import { switchDesktopServerSession } from "./desktop-server-switch"

export function configureApplicationSessions() {
  installDesktopServerSwitch(switchDesktopServerSession)
}
