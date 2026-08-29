export {
  applyActiveDesktopProfileWorkspace,
  desktopCloudConnectUrl,
  discoverRuntimeDesktopServer,
  getSelectedDesktopServer,
  initializeDesktopServer,
  isCloudDesktopServer,
  listDesktopServerProfiles,
  removeDesktopServerProfile,
  updateDesktopServerProfileSnapshot,
} from "./desktop-server"
export type {
  DesktopServer,
  DesktopServerProfile,
} from "./desktop-server"
export {
  requestDesktopServerReplacement,
} from "./desktop-server-replacement"
export { executeDesktopServerSwitch } from "./desktop-server-switch"
