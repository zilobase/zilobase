const MAX_ACTIVE_PER_USER = 2
const MAX_QUEUED_PER_USER = 8

type UserQueue = {
  active: number
  waiting: Array<() => void>
}

const queues = new Map<string, UserQueue>()

export class MailConcurrencyError extends Error {
  readonly status = 429
  constructor() {
    super("Too many Gmail operations are already running.")
    this.name = "MailConcurrencyError"
  }
}

export async function withMailUserConcurrency<T>(userId: string, operation: () => Promise<T>) {
  const queue = queues.get(userId) ?? { active: 0, waiting: [] }
  queues.set(userId, queue)
  if (queue.active >= MAX_ACTIVE_PER_USER) {
    if (queue.waiting.length >= MAX_QUEUED_PER_USER) throw new MailConcurrencyError()
    await new Promise<void>((resolve) => queue.waiting.push(resolve))
  }
  queue.active += 1
  try {
    return await operation()
  } finally {
    queue.active -= 1
    queue.waiting.shift()?.()
    if (queue.active === 0 && queue.waiting.length === 0) queues.delete(userId)
  }
}
