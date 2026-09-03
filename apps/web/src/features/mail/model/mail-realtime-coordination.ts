type LockManagerLike = {
  request<T>(
    name: string,
    options: { ifAvailable: true; mode: "exclusive" },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

const MAX_RECONNECT_MS = 30_000

export async function coordinateMailRevision(input: {
  bindingId?: string
  connectionId?: string
  locks?: LockManagerLike | null
  revision: number
  storage?: StorageLike | null
  synchronize: () => Promise<unknown>
}) {
  const scope = input.bindingId ?? input.connectionId
  if (!scope) throw new Error("A mail binding is required.")
  const key = `zilobase:mail:revision:${scope}`
  const storage = input.storage === undefined ? browserStorage() : input.storage
  const locks = input.locks === undefined ? browserLocks() : input.locks
  const synchronize = async () => {
    const current = Number(storage?.getItem(key) ?? -1)
    if (Number.isSafeInteger(current) && current >= input.revision) return false
    const result = await input.synchronize()
    if (result === null) return false
    storage?.setItem(key, String(input.revision))
    return true
  }
  if (!locks) return synchronize()
  return locks.request(
    `zilobase:mail:sync:${scope}`,
    { ifAvailable: true, mode: "exclusive" },
    (lock) => lock ? synchronize() : Promise.resolve(false),
  )
}

export async function coordinateMailRecovery(input: {
  bindingId?: string
  connectionId?: string
  locks?: LockManagerLike | null
  synchronize: () => Promise<unknown>
}) {
  const locks = input.locks === undefined ? browserLocks() : input.locks
  const scope = input.bindingId ?? input.connectionId
  if (!scope) throw new Error("A mail binding is required.")
  if (!locks) {
    await input.synchronize()
    return true
  }
  return locks.request(
    `zilobase:mail:sync:${scope}`,
    { ifAvailable: true, mode: "exclusive" },
    async (lock) => {
      if (!lock) return false
      await input.synchronize()
      return true
    },
  )
}

export function mailReconnectDelay(attempt: number) {
  return Math.min(MAX_RECONNECT_MS, 1_000 * 2 ** Math.max(0, Math.min(attempt, 10)))
}

function browserLocks() {
  if (typeof navigator === "undefined") return null
  return (navigator as Navigator & { locks?: LockManagerLike }).locks ?? null
}

function browserStorage() {
  if (typeof localStorage === "undefined") return null
  return localStorage
}
