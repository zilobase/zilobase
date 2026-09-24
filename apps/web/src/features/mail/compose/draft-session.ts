import type { MailComposeRequest } from "@zilobase/features/mail";

/** One queue owns provider draft identity across autosave, close, discard and send. */
export function createDraftSession(
  initialId: string | null,
  write: (id: string | null, value: MailComposeRequest) => Promise<string>,
) {
  let draftId = initialId;
  let saved = "";
  let tail: Promise<unknown> = Promise.resolve();
  let discarded = false;
  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = tail.then(run, run);
    tail = next;
    return next;
  }
  return {
    save(value: MailComposeRequest) {
      // Snapshot at enqueue time; a later render must never change this write.
      const serialized = JSON.stringify({ ...value, draftId: undefined });
      return enqueue(async () => {
        if (discarded) return draftId;
        if (serialized !== saved) {
          draftId = await write(draftId, value);
          saved = serialized;
        }
        return draftId;
      });
    },
    discard(remove: (id: string) => Promise<void>) {
      discarded = true;
      return enqueue(async () => {
        if (draftId) await remove(draftId);
        draftId = null;
      }).catch((error) => {
        discarded = false;
        throw error;
      });
    },
  };
}
