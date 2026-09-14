import type { DatabaseCommandDispatcher } from "./framework"
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error"

/** Commands are registered here as their domain operations migrate in passes 10 and 11. */
export const dispatchDatabaseCommand: DatabaseCommandDispatcher = async () => {
  throw new ServiceMutationError("Database command has not been migrated", 501)
}
