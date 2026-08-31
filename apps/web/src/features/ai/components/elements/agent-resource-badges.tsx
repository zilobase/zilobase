"use client";

import type { AgentCitation } from "@zilobase/features/ai-chat";
import { useNavigate } from "@tanstack/react-router";

import { toApiUrl } from "@/features/desktop/network/api";
import { useOptionalPageSidePane } from "@/features/pages/context/index";
import {
  DatabaseIcon,
  FileTextIcon,
} from "@/shared/components/icons";
import { getAgentCitationSidePaneTarget } from "./agent-citation-navigation";

export function AgentResourceBadges({
  citations,
  openInMainPage,
}: {
  citations: AgentCitation[];
  openInMainPage: boolean;
}) {
  const navigate = useNavigate();
  const sidePane = useOptionalPageSidePane();

  if (citations.length === 0) return null;

  return (
    <div
      aria-label="Pages, databases, and sources"
      className="not-prose mt-3 flex flex-wrap gap-2"
    >
      {citations.map((citation) => {
        const external = citation.url.startsWith("https://");
        const href = citation.url.startsWith("/api/")
          ? toApiUrl(citation.url)
          : citation.url;
        const sidePaneTarget = getAgentCitationSidePaneTarget(citation);
        const ResourceIcon = citation.source === "database"
          ? DatabaseIcon
          : FileTextIcon;

        return (
          <a
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-surface-canvas px-2 py-1 text-content-secondary text-xs transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral"
            href={href}
            key={`${citation.source}:${citation.id}`}
            onClick={(event) => {
              if (
                !sidePaneTarget ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              event.preventDefault();

              if (openInMainPage) {
                if (sidePane) {
                  if (sidePaneTarget.type === "database") {
                    sidePane.openDatabaseInMainPane(sidePaneTarget.id);
                    return;
                  }

                  sidePane.openPageInMainPane(sidePaneTarget.id);
                  return;
                }

                if (sidePaneTarget.type === "database") {
                  void navigate({
                    params: { databaseId: sidePaneTarget.id },
                    search: { view: undefined },
                    to: "/d/$databaseId",
                  });
                  return;
                }

                void navigate({
                  params: { pageId: sidePaneTarget.id },
                  to: "/p/$pageId",
                });
                return;
              }

              if (!sidePane) return;

              if (sidePaneTarget.type === "database") {
                sidePane.openDatabaseSidePane(sidePaneTarget.id);
                return;
              }

              sidePane.openSidePane(sidePaneTarget.id);
            }}
            rel={external ? "noreferrer" : undefined}
            target={external ? "_blank" : undefined}
            title={citation.excerpt ?? citation.title}
          >
            <ResourceIcon className="size-3.5 shrink-0" />
            <span className="truncate">{citation.title}</span>
          </a>
        );
      })}
    </div>
  );
}
