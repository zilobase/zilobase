import { useMemo } from "react";
import type { Components } from "streamdown";
import { chatMentionParts, chatCitationParts } from "@zilobase/features/ai";
import type { ContextManifestEntry, ResourceRef } from "@zilobase/page-context";
import { MessageResponse } from "./message";
import { SourcePill } from "./answer-sources";

const sourceTags = { "ai-source": ["index"] };

export function MessageSources({
  text,
  roots,
  manifest,
  isAnimating = false,
}: {
  text: string;
  roots?: ResourceRef[];
  manifest?: ContextManifestEntry[];
  isAnimating?: boolean;
}) {
  const { markdown, components } = useMemo(() => {
    const sources = new Map<
      string,
      { source: ResourceRef; entry?: ContextManifestEntry; blockId?: string }
    >();
    const parts = manifest ? chatCitationParts(text, manifest) : chatMentionParts(text, roots);
    const markdown = parts
      .map((part, index) => {
        if (part.type === "text") return part.text;
        const source =
          part.type === "source"
            ? part.source
            : part.entry.pageId
              ? { type: "page" as const, id: part.entry.pageId }
              : part.entry.databaseId
                ? { type: "database" as const, id: part.entry.databaseId }
                : null;
        if (!source) return "";
        const key = String(index);
        sources.set(key, {
          source,
          entry: part.type === "citation" ? part.entry : undefined,
          blockId: part.type === "citation" ? part.blockId : undefined,
        });
        return `<ai-source index="${key}"></ai-source>`;
      })
      .join("");
    // A dedicated inline tag leaves Streamdown's ordinary links and link-safety UI intact.
    const components: Components = {
      "ai-source": (props) => {
        const source = sources.get(String(props.index ?? ""));
        return source ? (
          <InlineMention source={source.source} entry={source.entry} blockId={source.blockId} />
        ) : null;
      },
    };
    return { markdown, components };
  }, [text, roots, manifest]);
  return (
    <MessageResponse components={components} allowedTags={sourceTags} isAnimating={isAnimating}>
      {markdown}
    </MessageResponse>
  );
}

function InlineMention({
  source,
  entry,
  blockId,
}: {
  source: ResourceRef;
  entry?: ContextManifestEntry;
  blockId?: string;
}) {
  return (
    <span
      data-ai-message-mention={`${source.type}:${source.id}`}
      className="mx-0.5 inline-flex max-w-full align-middle"
    >
      <SourcePill
        blockId={blockId}
        entry={
          entry ?? {
            key: `${source.type}:${source.id}`,
            title: source.type === "page" ? "Page" : "Database",
            ...(source.type === "page" ? { pageId: source.id } : { databaseId: source.id }),
          }
        }
      />
    </span>
  );
}
