import { ContentVerificationMetadata } from "../header/components/content-verification";
import { toast } from "sonner";
import { ImagePlus, MessageSquare, SmilePlus } from "@/components/icons";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

import { Button } from "@/components/ui/button";
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";

import { usePageCommentsSnapshot } from "@/sections/pages/editor/comments/components/comments-context";
import { useSession } from "@zilobase/features/auth/react";
import { type DatabasePresenceCollaborator } from "@zilobase/features/databases";
import { useDatabaseRealtime } from "@zilobase/features/databases/react";
import {
  useChangePageProperty,
  usePagePersonAccessTargets,
  usePageProperties,
} from "@zilobase/features/pages/react";

import {
  formatCommentButtonLabel,
  PageCommentThread,
} from "@/sections/pages/editor/comments/components/page-comments";
import type {
  PageIconPosition,
  PageLayoutConfig,
  PagePropertyPresenceTarget,
} from "@zilobase/features/pages";

import { PageCover } from "@/sections/pages/appearance/components/page-cover";
import { buildRandomCoverGalleryDataUrl } from "@/sections/pages/appearance/lib/page-cover-gallery";

import type { CollaborationPresenceUser } from "@/sections/pages/editor/collaboration/components/collaboration-presence";
import { CollaborationPresence } from "@/sections/pages/editor/collaboration/components/collaboration-presence";
import {
  parsePropertyValue,
  serializePropertyValue,
  type DatabasePropertyValue,
} from "@zilobase/features/databases";
import { PageMetadataProperties } from "../../databases/page-properties/components/page-metadata-properties";
import { getDatabasePropertyType } from "../../databases/properties/lib/property-catalog";
import { usePageCommentFocusRequest } from "../editor/comments/components/comments-context";

export type PageMetadataHandle = {
  focusTitleEnd: () => boolean;
};

type PageMetadataProps = {
  afterHeading?: ReactNode;
  allowIconPositionChange?: boolean;
  compact?: boolean;
  compactSpacing?: "default" | "comfortable";
  contentClassName?: string;
  collaborationUsers?: CollaborationPresenceUser[];
  cover?: string;
  coverOutside?: boolean;
  databaseId?: string | null;
  description?: string;
  descriptionInitiallyHidden?: boolean;
  descriptionPlaceholder?: string;
  editable?: boolean;
  enableComments?: boolean;
  forceDiscussionsExpanded?: boolean;
  headingLabel?: string;
  icon?: string;
  iconPosition?: PageIconPosition;
  layoutConfig?: PageLayoutConfig;
  layoutPropertyId?: string;
  layoutSection?: "heading" | "properties" | "discussions";
  onCoverChange?: (cover: string) => void;
  onDescriptionBlur?: () => void;
  onDescriptionChange?: (description: string) => void;
  onIconChange?: (icon: string) => void;
  onIconPositionChange?: (position: PageIconPosition) => void;
  onOpenPage?: (pageId: string) => void;
  onTitleEnter?: () => void;
  onTitleBlur?: () => void;
  onTitleChange?: (title: string) => void;
  workspaceId?: string | null;
  title?: string;
  titleSuffix?: ReactNode;
  titlePlaceholder?: string;
  pageId?: string | null;
  ref?: Ref<PageMetadataHandle>;
};

function PageDatabaseRealtimeSubscription({
  activePropertyId,
  editable,
  enabled,
  onPresenceChange,
  target,
}: {
  activePropertyId: string | null;
  editable: boolean;
  enabled: boolean;
  onPresenceChange: (
    databaseId: string,
    presence: Record<string, DatabasePresenceCollaborator[]> | null,
  ) => void;
  target: PagePropertyPresenceTarget;
}) {
  const presence =
    activePropertyId && target.propertyIds.includes(activePropertyId)
      ? {
          columnKey: activePropertyId,
          rowId: target.rowId,
          viewId: null,
        }
      : null;
  const realtime = useDatabaseRealtime(target.databaseId, {
    enabled,
    presence,
    publishPresence: editable,
  });

  useEffect(() => {
    onPresenceChange(target.databaseId, realtime.cellPresenceByKey);
  }, [onPresenceChange, realtime.cellPresenceByKey, target.databaseId]);

  useEffect(
    () => () => onPresenceChange(target.databaseId, null),
    [onPresenceChange, target.databaseId],
  );

  return null;
}

function resizeTitleTextarea(titleElement: HTMLTextAreaElement, titleRow: HTMLDivElement) {
  if (titleRow.clientWidth < 64) {
    return;
  }

  titleElement.style.height = "0px";
  titleElement.style.height = `${titleElement.scrollHeight}px`;
}

export function PageMetadata({
  afterHeading,
  allowIconPositionChange = true,
  compact = false,
  compactSpacing = "default",
  collaborationUsers = [],
  contentClassName,
  cover: coverProp,
  coverOutside = false,
  databaseId,
  description: descriptionProp,
  descriptionInitiallyHidden = false,
  descriptionPlaceholder = "Description (optional)",
  editable = true,
  enableComments = true,
  forceDiscussionsExpanded = false,
  headingLabel,
  icon: iconProp,
  iconPosition: iconPositionProp,
  layoutConfig,
  layoutPropertyId,
  layoutSection,
  onCoverChange,
  onDescriptionBlur,
  onDescriptionChange,
  onIconChange,
  onIconPositionChange,
  onOpenPage,
  onTitleEnter,
  onTitleBlur,
  onTitleChange,
  workspaceId,
  title: titleProp,
  titleSuffix,
  titlePlaceholder,
  pageId,
  ref,
}: PageMetadataProps) {
  const [iconOpen, setIconOpen] = useState(false);
  const [localCover, setLocalCover] = useState("");
  const [localIcon, setLocalIcon] = useState("");
  const [localIconPosition, setLocalIconPosition] = useState<PageIconPosition>("top");
  const [localDescription, setLocalDescription] = useState("");
  const [localTitle, setLocalTitle] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentFocus = usePageCommentFocusRequest(pageId);
  const [draftValues, setDraftValues] = useState<Record<string, DatabasePropertyValue>>({});
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [presenceByDatabase, setPresenceByDatabase] = useState<
    Record<string, Record<string, DatabasePresenceCollaborator[]>>
  >({});
  const titleRowRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState<boolean | null>(null);
  const descriptionRowRef = useRef<HTMLDivElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const { data: propertyPayload } = usePageProperties(pageId, {
    databaseId,
  });
  const needsPersonAccessTargets = useMemo(
    () => (propertyPayload?.properties ?? []).some((property) => property.type === "person"),
    [propertyPayload?.properties],
  );
  const { data: accessTargets } = usePagePersonAccessTargets(pageId, {
    enabled: needsPersonAccessTargets,
  });
  const { data: session } = useSession();
  const presenceTargets = propertyPayload?.presenceTargets ?? [];
  const updateDatabasePresence = useCallback(
    (
      realtimeDatabaseId: string,
      presence: Record<string, DatabasePresenceCollaborator[]> | null,
    ) => {
      setPresenceByDatabase((current) => {
        if (presence === null) {
          if (!(realtimeDatabaseId in current)) return current;

          const next = { ...current };
          delete next[realtimeDatabaseId];
          return next;
        }

        if (current[realtimeDatabaseId] === presence) return current;

        return { ...current, [realtimeDatabaseId]: presence };
      });
    },
    [],
  );
  const propertyPresenceById = useMemo(() => {
    const result: Record<string, DatabasePresenceCollaborator[]> = {};

    for (const target of presenceTargets) {
      const databasePresence = presenceByDatabase[target.databaseId];

      for (const propertyId of target.propertyIds) {
        const collaborators = databasePresence?.[`${target.rowId}:${propertyId}`] ?? [];
        const existing = result[propertyId] ?? [];

        result[propertyId] = [
          ...existing,
          ...collaborators.filter(
            (collaborator) => !existing.some((item) => item.user.id === collaborator.user.id),
          ),
        ];
      }
    }

    return result;
  }, [presenceByDatabase, presenceTargets]);
  const setPropertyActive = useCallback((propertyId: string, active: boolean) => {
    setActivePropertyId((current) =>
      active ? propertyId : current === propertyId ? null : current,
    );
  }, []);
  const commentsEnabled = Boolean(
    enableComments && layoutConfig?.discussionsVisible !== false && pageId && session?.user,
  );
  const commentsSnapshot = usePageCommentsSnapshot(commentsEnabled ? pageId : null);
  const changeProperty = useChangePageProperty();
  const cover = coverProp ?? localCover;
  const description = descriptionProp ?? localDescription;
  const icon = iconProp ?? localIcon;
  const iconPosition = iconPositionProp ?? localIconPosition;
  const title = titleProp ?? localTitle;
  const hasDescription = descriptionProp !== undefined || onDescriptionChange !== undefined;
  const showDescription =
    hasDescription && (descriptionExpanded ?? (!descriptionInitiallyHidden || !!description));
  const canToggleDescription = hasDescription && descriptionInitiallyHidden && editable;
  const metadataSubject = headingLabel ?? "page";
  const metadataSubjectLowercase = metadataSubject.toLowerCase();
  const unresolvedThreads = useMemo(
    () => commentsSnapshot.threads.filter((thread) => thread.kind === "page" && !thread.resolvedAt),
    [commentsSnapshot.threads],
  );
  const totalCommentCount = unresolvedThreads.reduce(
    (sum, thread) => sum + thread.comments.length,
    0,
  );
  const showHeading = !layoutSection || layoutSection === "heading";
  const showProperties = !layoutSection || layoutSection === "properties";
  const showDiscussions = !layoutSection || layoutSection === "discussions";
  const showCommentsSection =
    forceDiscussionsExpanded || commentsOpen || unresolvedThreads.length > 0;
  const propertyValues = useMemo(() => {
    const values: Record<string, DatabasePropertyValue> = {};

    for (const value of propertyPayload?.values ?? []) {
      const property = propertyPayload?.properties.find((item) => item.id === value.propertyId);
      values[value.propertyId] = parsePropertyValue(value.value, property?.type);
    }

    return values;
  }, [propertyPayload?.properties, propertyPayload?.values]);
  const standalonePropertyIds = useMemo(
    () =>
      new Set(
        (layoutConfig?.modules ?? [])
          .filter((module) => module.type === "property" && module.propertyId)
          .map((module) => module.propertyId as string),
      ),
    [layoutConfig?.modules],
  );
  const visibleProperties = useMemo(
    () =>
      [...(propertyPayload?.properties ?? [])]
        .sort((left, right) => {
          const leftIndex = layoutConfig?.propertyOrder.indexOf(left.id) ?? -1;
          const rightIndex = layoutConfig?.propertyOrder.indexOf(right.id) ?? -1;
          return (
            (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
          );
        })
        .filter((property) => {
          const setting = layoutConfig?.propertySettings[property.id];
          const value = propertyValues[property.id];
          if (setting?.display === "hidden") return false;
          if (
            setting?.display === "hide_when_empty" &&
            (value === "" ||
              value === null ||
              value === undefined ||
              (Array.isArray(value) && value.length === 0))
          )
            return false;
          return (
            !layoutConfig?.pinnedPropertyIds.includes(property.id) &&
            !standalonePropertyIds.has(property.id)
          );
        }),
    [
      layoutConfig?.pinnedPropertyIds,
      layoutConfig?.propertyOrder,
      layoutConfig?.propertySettings,
      propertyPayload?.properties,
      propertyValues,
      standalonePropertyIds,
    ],
  );
  const personOptions = useMemo(
    () =>
      (accessTargets?.members ?? []).map((member) => ({
        id: member.id,
        name: member.name || member.email,
        suffix: member.id === session?.user?.id ? "(you)" : undefined,
      })),
    [accessTargets?.members, session?.user?.id],
  );

  const commitPropertyValue = (
    propertyId: string,
    propertyType: string,
    value: DatabasePropertyValue,
  ) => {
    if (!pageId || !editable) {
      return;
    }

    setDraftValues((drafts) => {
      const next = { ...drafts };
      delete next[propertyId];
      return next;
    });

    void (async () => {
      try {
        await changeProperty.mutateAsync({
          pageId,
          databaseId,
          propertyId,
          value: serializePropertyValue(propertyType, value),
        });
        setDraftValues((drafts) => {
          const nextDrafts = { ...drafts };

          if (JSON.stringify(nextDrafts[propertyId]) === JSON.stringify(value))
            delete nextDrafts[propertyId];

          return nextDrafts;
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't save this property");
      } finally {
        // Committed values and rollback now come from the shared transaction.
        setDraftValues((drafts) => {
          if (JSON.stringify(drafts[propertyId]) !== JSON.stringify(value)) return drafts;
          const next = { ...drafts };
          delete next[propertyId];
          return next;
        });
      }
    })();
  };

  useEffect(() => {
    setCommentsOpen(false);
    setActivePropertyId(null);
    setDescriptionExpanded(null);
  }, [pageId]);

  useEffect(() => {
    if (commentFocus.requested) setCommentsOpen(true);
  }, [commentFocus.requested]);

  const updateCover = (nextCover: string) => {
    if (!editable) {
      return;
    }

    onCoverChange?.(nextCover);

    if (coverProp === undefined) {
      setLocalCover(nextCover);
    }
  };

  const updateDescription = (nextDescription: string) => {
    if (!editable) {
      return;
    }

    onDescriptionChange?.(nextDescription);

    if (descriptionProp === undefined) {
      setLocalDescription(nextDescription);
    }
  };

  const updateIcon = (nextIcon: string) => {
    if (!editable) {
      return;
    }

    onIconChange?.(nextIcon);

    if (iconProp === undefined) {
      setLocalIcon(nextIcon);
    }
  };

  const updateIconPosition = (nextPosition: PageIconPosition) => {
    if (!editable) {
      return;
    }

    onIconPositionChange?.(nextPosition);

    if (iconPositionProp === undefined) {
      setLocalIconPosition(nextPosition);
    }
  };

  const updateTitle = (nextTitle: string) => {
    if (!editable) {
      return;
    }

    onTitleChange?.(nextTitle);

    if (titleProp === undefined) {
      setLocalTitle(nextTitle);
    }
  };

  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    const titleRow = titleRowRef.current;

    if (titleElement && titleRow) {
      resizeTitleTextarea(titleElement, titleRow);
    }
  }, [title]);

  useLayoutEffect(() => {
    const descriptionElement = descriptionRef.current;
    const descriptionRow = descriptionRowRef.current;

    if (descriptionElement && descriptionRow) {
      resizeTitleTextarea(descriptionElement, descriptionRow);
    }
  }, [description]);

  useEffect(() => {
    const titleElement = titleRef.current;
    const titleRow = titleRowRef.current;

    if (!titleElement || !titleRow) {
      return;
    }

    let resizeFrame = 0;
    let previousWidth = titleRow.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? titleRow.clientWidth;

      if (width === previousWidth) {
        return;
      }

      previousWidth = width;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeTitleTextarea(titleElement, titleRow);
      });
    });

    observer.observe(titleRow);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    };
  }, []);

  useEffect(() => {
    const descriptionElement = descriptionRef.current;
    const descriptionRow = descriptionRowRef.current;

    if (!descriptionElement || !descriptionRow) {
      return;
    }

    let resizeFrame = 0;
    let previousWidth = descriptionRow.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? descriptionRow.clientWidth;

      if (width === previousWidth) {
        return;
      }

      previousWidth = width;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeTitleTextarea(descriptionElement, descriptionRow);
      });
    });

    observer.observe(descriptionRow);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    };
  }, [hasDescription]);

  useImperativeHandle(
    ref,
    () => ({
      focusTitleEnd: () => {
        const titleElement = titleRef.current;

        if (!showHeading || !titleElement) return false;

        titleElement.focus();
        titleElement.setSelectionRange(titleElement.value.length, titleElement.value.length);
        return true;
      },
    }),
    [showHeading],
  );

  const iconDisplay = (
    <PageIconDisplay
      className={iconPosition === "inline" ? "size-auto text-4xl [&_svg]:size-10" : "size-auto"}
      size={iconPosition === "top" ? "2xl" : "xl"}
      value={icon}
    />
  );

  const iconPicker =
    icon && editable ? (
      <div className="group/icon relative shrink-0">
        <Popover open={iconOpen} onOpenChange={setIconOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label={`Change ${metadataSubjectLowercase} icon`}
              className="inline-flex shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 leading-none focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
              disabled={!editable}
              type="button"
            >
              {iconDisplay}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto gap-0 overflow-hidden p-0"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            sideOffset={6}
          >
            <IconEmojiPicker
              onRemove={
                icon
                  ? () => {
                      updateIcon("");
                      setIconOpen(false);
                    }
                  : undefined
              }
              iconPosition={iconPosition}
              onEmojiSelect={(emoji) => {
                updateIcon(emoji);
                setIconOpen(false);
              }}
              onIconSelect={(svg) => {
                updateIcon(svg);
                setIconOpen(false);
              }}
              onIconPositionChange={allowIconPositionChange ? updateIconPosition : undefined}
            />
          </PopoverContent>
        </Popover>
      </div>
    ) : !icon && editable ? (
      <Popover open={iconOpen} onOpenChange={setIconOpen}>
        <PopoverTrigger asChild>
          <Button
            className="text-content-secondary"
            disabled={!editable}
            size="sm"
            type="button"
            variant="ghost"
          >
            <SmilePlus />
            {headingLabel ? `Add ${metadataSubjectLowercase} icon` : "Add icon"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto gap-0 overflow-hidden p-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          sideOffset={6}
        >
          <IconEmojiPicker
            iconPosition={iconPosition}
            onEmojiSelect={(emoji) => {
              updateIcon(emoji);
              setIconOpen(false);
            }}
            onIconSelect={(svg) => {
              updateIcon(svg);
              setIconOpen(false);
            }}
            onIconPositionChange={allowIconPositionChange ? updateIconPosition : undefined}
          />
        </PopoverContent>
      </Popover>
    ) : null;

  const pageIcon = icon ? (
    <div
      className={`flex w-fit shrink-0 items-center justify-center ${iconPosition === "top" ? "h-20" : "h-12"}`}
    >
      {editable ? iconPicker : iconDisplay}
    </div>
  ) : null;

  const showMetadataActions =
    canToggleDescription ||
    (!icon && editable) ||
    (!cover && editable) ||
    (commentsEnabled &&
      !layoutSection &&
      !showCommentsSection &&
      (editable || totalCommentCount > 0));

  const metadataActionVisibilityClassName =
    "opacity-0 transition-opacity pointer-events-none group-hover/metadata:opacity-100 group-hover/metadata:pointer-events-auto";

  return (
    <section className="group/metadata relative" contentEditable={false}>
      {presenceTargets.map((target) => (
        <PageDatabaseRealtimeSubscription
          activePropertyId={activePropertyId}
          editable={editable}
          enabled={Boolean(session?.user)}
          key={`${target.databaseId}:${target.rowId}`}
          onPresenceChange={updateDatabasePresence}
          target={target}
        />
      ))}
      {showHeading && !coverOutside ? (
        <PageCover
          cover={cover}
          editable={editable}
          onChange={updateCover}
          pageId={pageId}
          databaseId={databaseId}
          workspaceId={workspaceId}
          subject={metadataSubjectLowercase}
        />
      ) : null}

      {showHeading && collaborationUsers.length > 0 ? (
        <CollaborationPresence
          className={
            compact
              ? "absolute right-4 top-4"
              : cover && !coverOutside
                ? "absolute right-5 top-[calc(17.5rem+1.5rem)] sm:right-8 md:top-[calc(17.5rem+2rem)]"
                : "absolute right-5 top-6 sm:right-8 md:top-8"
          }
          users={collaborationUsers}
        />
      ) : null}

      <div
        data-page-metadata-content
        className={`page-content-column ${contentClassName ?? ""} relative ${compact ? (compactSpacing === "comfortable" ? "py-5 [--page-content-gutter:2rem]" : "py-4 [--page-content-gutter:1rem]") : `${showHeading && !cover ? "pt-8" : "pt-1"} pb-0`}`}
      >
        {/* Cancel the covered icon's 40px visual lift in flow, retaining the usual 4px gap. */}
        {showHeading && iconPosition === "top" && pageIcon ? (
          <div
            className={
              cover
                ? `${compact && compactSpacing === "comfortable" ? "-mt-5" : "-mt-4"} relative z-10 -mb-9 w-fit -translate-y-1/2`
                : "mb-1 w-fit"
            }
          >
            {pageIcon}
          </div>
        ) : null}

        {showHeading && (showMetadataActions || iconPosition === "inline") ? (
          <div className="relative mb-1 min-h-8">
            {showMetadataActions ? (
              <div
                className={`absolute inset-0 flex flex-wrap items-center gap-2 ${metadataActionVisibilityClassName}`}
              >
                {!icon ? iconPicker : null}
                {canToggleDescription && (
                  <Button
                    aria-expanded={showDescription}
                    className="text-content-secondary"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDescriptionExpanded(!showDescription);
                      if (!showDescription) {
                        requestAnimationFrame(() => descriptionRef.current?.focus());
                      }
                    }}
                  >
                    <MessageSquare />
                    {headingLabel
                      ? `${showDescription ? "Hide" : "Add"} ${metadataSubjectLowercase} description`
                      : `${showDescription ? "Hide" : "Add"} description`}
                  </Button>
                )}
                {!cover && editable ? (
                  <Button
                    className="text-content-secondary"
                    disabled={!editable}
                    onClick={() => updateCover(buildRandomCoverGalleryDataUrl())}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ImagePlus />
                    {headingLabel ? `Add ${metadataSubjectLowercase} cover` : "Add cover"}
                  </Button>
                ) : null}
                {commentsEnabled &&
                !layoutSection &&
                !showCommentsSection &&
                (editable || totalCommentCount > 0) ? (
                  <Button
                    className="text-content-secondary"
                    onClick={() => {
                      setCommentsOpen((open) => !open);
                      if (totalCommentCount === 0) {
                        setCommentsOpen(true);
                      }
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <MessageSquare />
                    {formatCommentButtonLabel(totalCommentCount)}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showHeading ? (
          <div
            className={`flex items-start ${iconPosition === "inline" && pageIcon ? "gap-2" : "gap-3"}`}
            ref={titleRowRef}
          >
            {iconPosition === "inline" ? pageIcon : null}
            <textarea
              aria-label={headingLabel ? `${headingLabel} title` : "Page title"}
              className={`min-h-10 min-w-0 ${titleSuffix ? "flex-initial [field-sizing:content]" : "flex-1"} resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-4xl font-semibold leading-tight tracking-normal whitespace-pre-wrap text-balance text-content-primary shadow-none outline-none placeholder:text-content-secondary placeholder:opacity-60 focus-visible:ring-0 dark:bg-transparent`}
              onBlur={onTitleBlur}
              onChange={(event) => updateTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                  onTitleEnter?.();
                }
              }}
              placeholder={
                titlePlaceholder ?? (headingLabel ? `${headingLabel} title` : "New page")
              }
              readOnly={!editable}
              ref={titleRef}
              rows={1}
              value={title}
            />
            {titleSuffix ? (
              <span className="flex shrink-0 self-center items-center text-content-secondary">
                {titleSuffix}
              </span>
            ) : null}
          </div>
        ) : null}

        {showHeading && showDescription && (editable || description) ? (
          <div className="mt-3 flex" ref={descriptionRowRef}>
            <textarea
              aria-label={headingLabel ? `${headingLabel} description` : "Page description"}
              className="min-h-6 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-base leading-relaxed text-content-secondary shadow-none outline-none placeholder:text-content-secondary placeholder:opacity-60 focus-visible:ring-0 dark:bg-transparent"
              onBlur={onDescriptionBlur}
              onChange={(event) => updateDescription(event.target.value)}
              placeholder={descriptionPlaceholder}
              readOnly={!editable}
              ref={descriptionRef}
              rows={1}
              value={description}
            />
          </div>
        ) : null}

        {showHeading && layoutConfig?.pinnedPropertyIds.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {layoutConfig.pinnedPropertyIds.flatMap((propertyId) => {
              const property = propertyPayload?.properties.find((item) => item.id === propertyId);
              if (!property) return [];
              const value = propertyValues[property.id];
              const PropertyIcon = getDatabasePropertyType(property.type).icon;
              return [
                <span
                  className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-2 py-1 text-xs text-content-secondary"
                  key={property.id}
                >
                  {layoutConfig.propertyIcons ? <PropertyIcon className="size-3.5" /> : null}
                  <span>{property.name}</span>
                  <span className="text-content-primary">
                    {Array.isArray(value) ? value.join(", ") : String(value || "Empty")}
                  </span>
                </span>,
              ];
            })}
          </div>
        ) : null}

        {showDiscussions && commentsEnabled && showCommentsSection ? (
          <div className="mt-6 space-y-0 pb-3">
            {unresolvedThreads.length > 0 ? (
              unresolvedThreads.map((thread, index) => (
                <div
                  className={index > 0 ? "mt-5 border-t border-stroke-default pt-4" : ""}
                  key={thread.id}
                >
                  <PageCommentThread
                    placeholder={index === 0 ? "Add a comment..." : "Reply..."}
                    acceptPageFocus={index === 0}
                    threadId={thread.id}
                    pageId={pageId}
                  />
                </div>
              ))
            ) : (
              <PageCommentThread placeholder="Add a comment..." pageId={pageId} />
            )}
            <div className="mt-5 border-t border-stroke-default" />
          </div>
        ) : null}

        {showProperties &&
        pageId &&
        workspaceId &&
        !layoutPropertyId &&
        !propertyPayload?.properties.some((property) => property.type === "verification") ? (
          <ContentVerificationMetadata
            resource={{ workspaceId, type: "page", id: pageId }}
            editable={editable}
          />
        ) : null}

        {showProperties &&
        (layoutPropertyId
          ? propertyPayload?.properties.some((property) => property.id === layoutPropertyId)
          : visibleProperties.length) ? (
          <PageMetadataProperties
            draftValues={draftValues}
            editable={editable}
            layoutConfig={layoutConfig}
            layoutPropertyId={layoutPropertyId}
            onCommit={commitPropertyValue}
            onDraftValuesChange={setDraftValues}
            onOpenPage={onOpenPage}
            onPropertyActive={setPropertyActive}
            pageId={pageId}
            personOptions={personOptions}
            presenceByProperty={propertyPresenceById}
            propertyPayload={propertyPayload}
            propertyValues={propertyValues}
            title={title}
            visibleProperties={visibleProperties}
          />
        ) : null}

        {showHeading && afterHeading ? afterHeading : null}
      </div>
    </section>
  );
}
