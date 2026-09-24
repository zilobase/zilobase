import type { MailFilterExpression, MailThreadSummary, MailView } from "@zilobase/features/mail";
import {
  evaluateMailFilterExpression,
  mailFilterRecordFromThreadSummary,
} from "@zilobase/features/mail";
import type { MailDatabase } from "./mail-database";

function cachedThreadMatchesView(thread: MailThreadSummary, view: MailView) {
  if (view === "all_mail")
    return !["SPAM", "TRASH"].some((label) => thread.labelIds.includes(label));
  if (view === "archive")
    return !["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"].some((label) =>
      thread.labelIds.includes(label),
    );
  const label = {
    inbox: "INBOX",
    sent: "SENT",
    drafts: "DRAFT",
    bin: "TRASH",
    trash: "TRASH",
    spam: "SPAM",
    starred: "STARRED",
    unread: "UNREAD",
    important: "IMPORTANT",
  }[view];
  return label ? thread.labelIds.includes(label) : true;
}

export function readCachedMailThreads(
  database: MailDatabase,
  view: MailView,
  limit: number,
  filter?: MailFilterExpression | null,
  query = "",
) {
  const search = query.trim().toLowerCase();
  return database.threads
    .orderBy("internalDate")
    .reverse()
    .filter((thread) => {
      const matches = filter
        ? evaluateMailFilterExpression(mailFilterRecordFromThreadSummary(thread), filter)
        : cachedThreadMatchesView(thread, view);
      return (
        matches &&
        (!search ||
          [
            thread.subject,
            thread.snippet,
            ...thread.participants.flatMap((person) => [person.name ?? "", person.address]),
          ].some((value) => value.toLowerCase().includes(search)))
      );
    })
    .limit(limit)
    .toArray();
}
