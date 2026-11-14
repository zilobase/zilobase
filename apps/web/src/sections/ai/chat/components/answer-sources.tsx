import type { chatCitations } from "@zilobase/features/ai";
import { useChatAttachmentMetadata } from "@zilobase/features/ai/react";
import { createContext, useContext } from "react";
import { getNavigationItemPath } from "@/app/routing/route-identifiers";
import { Link } from "@tanstack/react-router";
import { usePageSidePane } from "@/sections/pages/presentation/components/page-presentation";
import { AttachmentPill } from "../../attachments/components/context-attachment";
import { cn } from "@/lib/utils";

type SourceLink = Pick<
  ReturnType<typeof chatCitations>[number],
  "key" | "title" | "emoji" | "pageId" | "databaseId"
>;

export const ChatSourceContext = createContext<{
  workspaceId: string | null;
  openIn: "sidepanel" | "main";
}>({ workspaceId: null, openIn: "main" });

/** `blockId` opens the page at one cited block. */
export function SourcePill({ entry, blockId }: { entry: SourceLink; blockId?: string }) {
  const { workspaceId, openIn } = useContext(ChatSourceContext);
  const source = entry.pageId
    ? { type: "page" as const, id: entry.pageId }
    : { type: "database" as const, id: entry.databaseId! };
  const metadata = useChatAttachmentMetadata(workspaceId, source);
  const identity = workspaceId ? metadata : entry;
  const { openSidePane, openDatabaseSidePane } = usePageSidePane();
  return (
    <AttachmentPill
      title={identity.title}
      emoji={identity.emoji}
      type={source.type}
      render={(content) => (
        <Link
          title={identity.title}
          to={getNavigationItemPath(
            entry.pageId
              ? { pageId: encodeURIComponent(entry.pageId) }
              : { databaseId: encodeURIComponent(entry.databaseId!) },
          )}
          search={entry.pageId && blockId ? { block: blockId } : undefined}
          onClick={(event) => {
            // The side pane has no block focus; block citations open the page itself.
            if (
              openIn !== "sidepanel" ||
              (entry.pageId && blockId) ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            if (entry.pageId) openSidePane(entry.pageId, { databaseId: entry.databaseId });
            else openDatabaseSidePane(entry.databaseId!);
          }}
        >
          {content}
        </Link>
      )}
    />
  );
}

export function AnswerSources({
  citations,
  label = "Answer sources",
  className,
}: {
  citations: SourceLink[];
  label?: string;
  className?: string;
}) {
  if (!citations.length) return null;
  return (
    <div className={cn("mt-2 flex min-w-0 flex-wrap gap-2", className)} aria-label={label}>
      {citations.map((entry) => (
        <SourcePill key={entry.key} entry={entry} />
      ))}
    </div>
  );
}
