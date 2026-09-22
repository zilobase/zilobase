export {
  applyActiveDesktopProfileWorkspace,
  desktopCloudConnectUrl,
  desktopDevelopmentTargets,
  discoverRuntimeDesktopServer,
  getSelectedDesktopServer,
  initializeDesktopServer,
  isCloudDesktopServer,
  listDesktopServerProfiles,
  removeDesktopServerProfile,
  updateDesktopServerProfileSnapshot,
} from "../../../platform/server/desktop-server"
export type {
  DesktopServer,
  DesktopServerProfile,
} from "../../../platform/server/desktop-server"
export {
  requestDesktopServerReplacement,
} from "./desktop-server-replacement"
export { executeDesktopServerSwitch } from "./desktop-server-switch"
