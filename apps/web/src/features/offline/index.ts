export { OfflineAvailabilityAction } from "./components/offline-availability-action"
export {
  applyTicketState,
  connectLocalPageDocument,
  destroyDesktopOfflineConnections,
  documentDiffersFromConfirmed,
  flushLocalPageDocument,
  openLocalPageDocument,
  recordConfirmedDocument,
  shouldMarkOfflineDocumentDirty,
} from "./documents/offline-documents"
export type { CollaborationTicket } from "./documents/offline-documents"
export {
  downloadRecoveryArchive,
  importRecoveryArchive,
  syncDirtyOfflinePages,
} from "./documents/offline-recovery"
export {
  OfflineStructureGuard,
  shouldEnableOfflineStructureGuard,
} from "./documents/offline-structure-guard"
export {
  resolveOfflineFallback,
  waitForSettledConnectivity,
} from "./model/connectivity-probe"
export {
  clearAllOfflineData,
  clearDesktopServerIndexedData,
  disableOfflineWorkspace,
  enableOfflineWorkspace,
  getConnectivityState,
  getOfflineManifest,
  getValidOfflineSession,
  hasUnsyncedOfflineItems,
  isDesktopOfflineSupported,
  patchOfflineItem,
  subscribeConnectivity,
} from "./model/offline-store"
export {
  OfflineQueryProvider,
  useConnectivity,
  useOfflineManifest,
  useOfflineSessionLocked,
} from "./providers/offline-provider"
