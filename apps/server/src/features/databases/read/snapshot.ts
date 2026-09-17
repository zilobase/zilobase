import { db, runWithDb } from "../../../infrastructure/database"

/** Host versions and every entity in a response come from one committed state. */
export function withDatabaseReadSnapshot<T>(read: () => Promise<T>): Promise<T> {
  return db.transaction(
    (transaction) => runWithDb(transaction, read),
    { accessMode: "read only", isolationLevel: "repeatable read" },
  )
}
