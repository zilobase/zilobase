"use client";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { ContextAttachChips } from "@/components/ai-elements/context-attach-chips";
import {
  buildPrimaryAttachment,
  ContextAttachMenu,
  getAttachmentKey,
  parseMentionState,
  type ContextAttachMenuEntry,
  type ContextAttachMenuHandle,
} from "@/components/ai-elements/context-attach-menu";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { usePageEditorRegistry } from "@/contexts/page-editor-registry";
import { usePageAiContext } from "@/hooks/use-page-ai-context";
import { useDatabaseEmbedAutoApply } from "@/hooks/use-database-embed-auto-apply";
import { useDatabaseToolCacheSync } from "@/hooks/use-database-tool-cache-sync";
import {
  updatePageEditSnapshotStatus,
  usePageEditAutoApply,
} from "@/hooks/use-page-edit-auto-apply";
import { usePageEditApplier } from "@/hooks/use-page-edit-applier";
import { DatabaseToolStepsGroup } from "@/components/ai-elements/database-tool-steps";
import {
  buildMessagePartGroups,
  IntegrationToolTaskGroup,
} from "@/components/ai-elements/integration-tool-task";
import { PageEditCard } from "@/components/ai-elements/page-edit-card";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { ToolPart } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  aiChatThreadMessagesQueryKey,
  aiChatThreadMessagesQueryOptions,
  buildPageEditSnapshotMap,
  dedupeChatMessagesById,
  isProposePageContentUpdateToolName,
  isPageEditBaselineCurrent,
  isPageEditReviewAvailable,
  logPageEdit,
  type AiChatThreadMessagesResponse,
  type ProposePageContentUpdateOutput,
  type PageEditSnapshotPart,
} from "@notelab/features/ai-chat";
import { useSession } from "@notelab/features/auth";
import { useNotelabFeatures } from "@notelab/features";
import { useDatabase } from "@notelab/features/databases";
import {
  useActiveWorkspaceId,
  useIntegrations,
  useWorkspaceAiModels,
} from "@notelab/features/integrations";
import {
  usePageAccessLevel,
  usePages,
} from "@notelab/features/pages";
import type { WorkspaceAiChatModel } from "@notelab/features/integrations";
import { useQuery } from "@tanstack/react-query";
import { integrationIcons } from "@/lib/integration-icons";
import { useChat } from "@ai-sdk/react";
import {
  getApiRequestHeaders,
  toApiUrl,
} from "@/lib/api";
import {
  GmailToolOutput,
  isGmailToolName,
} from "@notelab/connectors/gmail/ui";
import {
  GithubToolOutput,
  isGithubToolName,
} from "@notelab/connectors/github/ui";
import {
  GoogleCalendarToolOutput,
  isGoogleCalendarToolName,
} from "@notelab/connectors/google-calendar/ui";
import {
  GoogleDriveToolOutput,
  isGoogleDriveToolName,
} from "@notelab/connectors/google-drive/ui";
import {
  isLinearToolName,
  LinearToolOutput,
} from "@notelab/connectors/linear/ui";
import {
  isSlackToolName,
  SlackToolOutput,
} from "@notelab/connectors/slack/ui";
import {
  type ChatStatus,
  DefaultChatTransport,
  type UIMessage,
  getToolName,
  isToolUIPart,
} from "ai";
import {
  extractPageMarkdownFromContext,
  logPageContextSent,
  logPageContextRebuild,
  prosemirrorToMarkdown,
  type ContextAttachment,
  type ContextSourceRef,
} from "@notelab/page-context";
import { ArrowDownIcon, CheckIcon, InboxIcon, PlusIcon, XIcon } from "lucide-react";
import { useGenerativeToolUiEnabled } from "@/lib/debug-settings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const fallbackModels: WorkspaceAiChatModel[] = [
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-4o-mini",
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    providers: ["openai"],
  },
  {
    chef: "OpenAI",
    chefSlug: "openai",
    gatewayId: "gpt-4o",
    id: "gpt-4o",
    name: "GPT-4o",
    providers: ["openai"],
  },
];

function areMessagesEquivalent(
  leftMessages: UIMessage[],
  rightMessages: UIMessage[],
) {
  if (leftMessages === rightMessages) {
    return true;
  }

  if (leftMessages.length !== rightMessages.length) {
    return false;
  }

  return leftMessages.every((leftMessage, index) => {
    const rightMessage = rightMessages[index];

    if (
      leftMessage === rightMessage ||
      (leftMessage.id === rightMessage.id &&
        leftMessage.role === rightMessage.role &&
        leftMessage.parts === rightMessage.parts)
    ) {
      return true;
    }

    return JSON.stringify(leftMessage) === JSON.stringify(rightMessage);
  });
}

const emptyAgentChatMessages: UIMessage[] = [];

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      cause: error.cause,
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: typeof error,
  };
}

function summarizeMessagesForDebug(messages: UIMessage[]) {
  const lastMessage = messages.at(-1);

  return {
    count: messages.length,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          partTypes: lastMessage.parts.map((part) => part.type),
          role: lastMessage.role,
        }
      : null,
    roles: messages.map((message) => message.role),
  };
}

function logAiChatError(
  source: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  const errorDetails = getErrorDetails(error);

  console.groupCollapsed(
    `[notelab ai chat] ${source}: ${errorDetails.message}`,
  );
  console.error(error);
  console.info("error details", errorDetails);
  console.info("context", context);
  console.groupEnd();
}

type SourceId =
  | "gmail"
  | "github"
  | "google-calendar"
  | "google-drive"
  | "slack"
  | "linear";

const availableSources: Array<{
  description: string;
  id: SourceId;
  label: string;
}> = [
  {
    description: "Email, inbox, threads, people, and message context.",
    id: "gmail",
    label: "Gmail",
  },
  {
    description: "Repositories, issues, pull requests, commits, and files.",
    id: "github",
    label: "GitHub",
  },
  {
    description: "Meetings, events, schedules, and coworker availability.",
    id: "google-calendar",
    label: "Calendar",
  },
  {
    description: "Drive files, Docs, Sheets, Slides, folders, and owners.",
    id: "google-drive",
    label: "Drive",
  },
  {
    description: "Page channels, threads, canvases, and files.",
    id: "slack",
    label: "Slack",
  },
  {
    description: "Issues, projects, teams, priorities, and roadmap work.",
    id: "linear",
    label: "Linear",
  },
];

const toolTitles: Record<string, string> = {
  getGmailDraft: "Read Gmail draft",
  getGmailLabel: "Read Gmail label",
  getGmailMessage: "Read Gmail message",
  getGmailMessageAttachment: "Read Gmail attachment",
  getGmailProfile: "Check Gmail profile",
  getGmailRawMessage: "Read raw Gmail message",
  getGmailThread: "Read Gmail thread",
  getGithubContent: "Read GitHub content",
  getGithubIssue: "Read GitHub issue",
  getGithubProfile: "Check GitHub profile",
  getGithubPullRequest: "Read GitHub PR",
  getGithubRepository: "Read GitHub repo",
  listGmailHistory: "List Gmail history",
  listGmailDrafts: "List Gmail drafts",
  listGmailLabels: "List Gmail labels",
  listGmailMessageAttachments: "List Gmail attachments",
  listGmailThreads: "List Gmail threads",
  listGithubCommits: "List GitHub commits",
  listGithubIssues: "List GitHub issues",
  listGithubPullRequests: "List GitHub PRs",
  listGithubRepositories: "List GitHub repos",
  listGoogleCalendarCalendars: "List calendars",
  listGoogleCalendarEvents: "List calendar events",
  queryGoogleCalendarFreeBusy: "Check availability",
  getGoogleDriveFile: "Read Drive file",
  getGoogleDriveFileText: "Read Drive text",
  getGoogleDriveProfile: "Check Drive profile",
  listGoogleDriveFiles: "List Drive files",
  searchGoogleDriveFiles: "Search Drive",
  getLinearIssue: "Read Linear issue",
  getLinearIssueComments: "Read Linear comments",
  getLinearProfile: "Check Linear profile",
  getSlackConversationHistory: "Read Slack history",
  getSlackFileInfo: "Read Slack file",
  getSlackProfile: "Check Slack profile",
  getSlackThread: "Read Slack thread",
  getSlackUser: "Read Slack user",
  listLinearIssues: "List Linear issues",
  listLinearProjects: "List Linear projects",
  listLinearTeams: "List Linear teams",
  listSlackCanvases: "List Slack canvases",
  listSlackFiles: "List Slack files",
  listSlackConversations: "List Slack channels",
  lookupSlackCanvasSections: "Find canvas sections",
  searchGmailMessages: "Search Gmail",
  searchLinearIssues: "Search Linear issues",
  searchSlackMessages: "Search Slack",
  proposePageContentUpdate: "Update page content",
  createPage: "Create page",
  createDatabase: "Create database",
  embedDatabaseInPage: "Embed database in page",
  linkDatabaseInPage: "Link database in sidebar",
  createDatabaseProperty: "Add database property",
  updateDatabaseProperty: "Update database property",
  createDatabaseView: "Create database view",
  updateDatabaseView: "Update database view",
  updateDatabase: "Update database",
  createDatabaseRow: "Add database row",
  setDatabaseCellValue: "Set cell value",
};

const toolSources: Record<string, keyof typeof integrationIcons> = {
  getGmailDraft: "gmail",
  getGmailLabel: "gmail",
  getGmailMessage: "gmail",
  getGmailMessageAttachment: "gmail",
  getGmailProfile: "gmail",
  getGmailRawMessage: "gmail",
  getGmailThread: "gmail",
  listGmailHistory: "gmail",
  listGmailDrafts: "gmail",
  listGmailLabels: "gmail",
  listGmailMessageAttachments: "gmail",
  listGmailThreads: "gmail",
  searchGmailMessages: "gmail",
  getGithubContent: "github",
  getGithubIssue: "github",
  getGithubProfile: "github",
  getGithubPullRequest: "github",
  getGithubRepository: "github",
  listGithubCommits: "github",
  listGithubIssues: "github",
  listGithubPullRequests: "github",
  listGithubRepositories: "github",
  listGoogleCalendarCalendars: "googleCalendar",
  listGoogleCalendarEvents: "googleCalendar",
  queryGoogleCalendarFreeBusy: "googleCalendar",
  getGoogleDriveFile: "googleDrive",
  getGoogleDriveFileText: "googleDrive",
  getGoogleDriveProfile: "googleDrive",
  listGoogleDriveFiles: "googleDrive",
  searchGoogleDriveFiles: "googleDrive",
  getLinearIssue: "linear",
  getLinearIssueComments: "linear",
  getLinearProfile: "linear",
  listLinearIssues: "linear",
  listLinearProjects: "linear",
  listLinearTeams: "linear",
  searchLinearIssues: "linear",
  getSlackConversationHistory: "slack",
  getSlackFileInfo: "slack",
  getSlackProfile: "slack",
  getSlackThread: "slack",
  getSlackUser: "slack",
  listSlackCanvases: "slack",
  listSlackConversations: "slack",
  listSlackFiles: "slack",
  lookupSlackCanvasSections: "slack",
  searchSlackMessages: "slack",
};

const toolPhrases: Record<string, string[]> = {
  getGmailDraft: [
    "Opening the Gmail draft",
    "Reading draft content",
    "Checking draft metadata",
  ],
  getGmailLabel: [
    "Opening the Gmail label",
    "Reading label details",
    "Checking label counts",
  ],
  getGmailMessage: [
    "Opening the Gmail message",
    "Reading the email details",
    "Analyzing the message context",
  ],
  getGmailMessageAttachment: [
    "Opening the Gmail attachment",
    "Reading attachment data",
    "Checking attachment content",
  ],
  getGmailProfile: [
    "Checking the Gmail profile",
    "Reading mailbox metadata",
    "Confirming Gmail access",
  ],
  getGmailRawMessage: [
    "Opening raw Gmail source",
    "Reading MIME data",
    "Checking message source",
  ],
  getGmailThread: [
    "Opening the Gmail thread",
    "Reading the email conversation",
    "Analyzing thread context",
  ],
  listGmailHistory: [
    "Listing Gmail history",
    "Reading mailbox changes",
    "Checking recent Gmail events",
  ],
  listGmailDrafts: [
    "Listing Gmail drafts",
    "Reading draft messages",
    "Checking draft metadata",
  ],
  listGmailLabels: [
    "Listing Gmail labels",
    "Reading mailbox labels",
    "Checking label counts",
  ],
  listGmailMessageAttachments: [
    "Listing Gmail attachments",
    "Scanning message parts",
    "Checking downloadable attachments",
  ],
  listGmailThreads: [
    "Listing Gmail threads",
    "Reading email conversations",
    "Scanning thread summaries",
  ],
  searchGmailMessages: [
    "Searching Gmail",
    "Scanning matching emails",
    "Analyzing email results",
  ],
  getGithubContent: [
    "Opening GitHub content",
    "Reading repository files",
    "Analyzing code context",
  ],
  getGithubIssue: [
    "Opening the GitHub issue",
    "Reading issue details",
    "Analyzing issue context",
  ],
  getGithubProfile: [
    "Checking the GitHub profile",
    "Reading account details",
    "Confirming GitHub access",
  ],
  getGithubPullRequest: [
    "Opening the GitHub pull request",
    "Reading PR details",
    "Analyzing review context",
  ],
  getGithubRepository: [
    "Opening the GitHub repository",
    "Reading repository details",
    "Analyzing repo context",
  ],
  listGithubCommits: [
    "Listing GitHub commits",
    "Scanning commit history",
    "Analyzing code changes",
  ],
  listGithubIssues: [
    "Listing GitHub issues",
    "Scanning repository issues",
    "Analyzing issue status",
  ],
  listGithubPullRequests: [
    "Listing GitHub pull requests",
    "Scanning PR activity",
    "Analyzing review status",
  ],
  listGithubRepositories: [
    "Listing GitHub repositories",
    "Scanning visible repos",
    "Finding repository context",
  ],
  listGoogleCalendarCalendars: [
    "Listing calendars",
    "Checking calendar access",
    "Reading calendar metadata",
  ],
  listGoogleCalendarEvents: [
    "Reading calendar events",
    "Scanning scheduled meetings",
    "Analyzing calendar context",
  ],
  queryGoogleCalendarFreeBusy: [
    "Checking availability",
    "Reading free/busy blocks",
    "Finding open schedule windows",
  ],
  getGoogleDriveFile: [
    "Opening the Drive file",
    "Reading file metadata",
    "Analyzing Drive context",
  ],
  getGoogleDriveFileText: [
    "Reading Drive file text",
    "Exporting readable content",
    "Analyzing document content",
  ],
  getGoogleDriveProfile: [
    "Checking the Drive profile",
    "Reading storage metadata",
    "Confirming Drive access",
  ],
  listGoogleDriveFiles: [
    "Listing Drive files",
    "Scanning recent files",
    "Finding Drive context",
  ],
  searchGoogleDriveFiles: [
    "Searching Drive",
    "Scanning matching files",
    "Analyzing Drive results",
  ],
  getLinearIssue: [
    "Opening the Linear issue",
    "Reading issue details",
    "Analyzing issue context",
  ],
  getLinearIssueComments: [
    "Reading Linear comments",
    "Scanning issue discussion",
    "Analyzing comment context",
  ],
  getLinearProfile: [
    "Checking the Linear page",
    "Reading Linear profile details",
    "Confirming Linear access",
  ],
  listLinearIssues: [
    "Listing Linear issues",
    "Scanning visible tickets",
    "Analyzing issue context",
  ],
  listLinearProjects: [
    "Listing Linear projects",
    "Scanning project status",
    "Analyzing project context",
  ],
  listLinearTeams: [
    "Listing Linear teams",
    "Scanning visible teams",
    "Finding team context",
  ],
  searchLinearIssues: [
    "Searching Linear issues",
    "Scanning ticket matches",
    "Analyzing Linear results",
  ],
  getSlackConversationHistory: [
    "Reading Slack history",
    "Scanning recent channel messages",
    "Analyzing conversation context",
  ],
  getSlackFileInfo: [
    "Opening the Slack file",
    "Reading file metadata",
    "Analyzing file context",
  ],
  getSlackProfile: [
    "Checking the Slack page",
    "Reading Slack profile details",
    "Confirming Slack access",
  ],
  getSlackThread: [
    "Opening the Slack thread",
    "Reading threaded replies",
    "Analyzing thread context",
  ],
  getSlackUser: [
    "Looking up the Slack user",
    "Reading profile details",
    "Analyzing user context",
  ],
  listSlackCanvases: [
    "Listing Slack canvases",
    "Scanning available canvases",
    "Analyzing canvas matches",
  ],
  listSlackConversations: [
    "Listing Slack channels",
    "Scanning visible conversations",
    "Finding the right channel context",
  ],
  listSlackFiles: [
    "Listing Slack files",
    "Scanning shared files",
    "Analyzing file matches",
  ],
  lookupSlackCanvasSections: [
    "Searching Slack canvas sections",
    "Scanning canvas headings",
    "Analyzing canvas matches",
  ],
  searchSlackMessages: [
    "Searching Slack",
    "Scanning message matches",
    "Analyzing Slack results",
  ],
};

const pendingPhrases = [
  "Thinking through your question",
  "Analyzing page context",
  "Searching connected sources",
  "Preparing tool calls",
];

const providerLogoSlugs: Record<string, string> = {
  "fireworks": "fireworks-ai",
  "google-ai-studio": "google",
  "together": "togetherai",
};

function getProviderLogoSlug(provider: string) {
  return providerLogoSlugs[provider] ?? provider;
}

const ShellScrollButton = ({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const scrollShell = targetRef.current?.closest(
      "[data-ai-scroll-shell]"
    ) as HTMLElement | null;

    if (!scrollShell) {
      return;
    }

    const updateVisibility = () => {
      const distanceFromBottom =
        scrollShell.scrollHeight - scrollShell.scrollTop - scrollShell.clientHeight;

      setIsVisible(distanceFromBottom > 160);
    };

    updateVisibility();
    scrollShell.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      scrollShell.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [targetRef]);

  const handleClick = useCallback(() => {
    const scrollShell = targetRef.current?.closest(
      "[data-ai-scroll-shell]"
    ) as HTMLElement | null;

    scrollShell?.scrollTo({
      behavior: "smooth",
      top: scrollShell.scrollHeight,
    });
  }, [targetRef]);

  if (!isVisible) {
    return null;
  }

  return (
    <Button
      className="absolute top-3 left-1/2 z-20 size-8 -translate-x-1/2 -translate-y-full rounded-full bg-background shadow-sm"
      onClick={handleClick}
      size="icon"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-4" />
      <span className="sr-only">Scroll to bottom</span>
    </Button>
  );
};

const ModelItem = ({
  m,
  isSelected,
  onSelect,
}: {
  m: WorkspaceAiChatModel;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const handleSelect = useCallback(() => {
    onSelect(m.id);
  }, [onSelect, m.id]);

  return (
    <ModelSelectorItem onSelect={handleSelect} value={m.id}>
      <ModelSelectorLogo provider={getProviderLogoSlug(m.chefSlug)} />
      <ModelSelectorName>{m.name}</ModelSelectorName>
      <ModelSelectorLogoGroup>
        {m.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={getProviderLogoSlug(provider)} />
        ))}
      </ModelSelectorLogoGroup>
      {isSelected ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
};

const SourceSelector = ({
  enabledSources,
  selectedSources,
  onAddSource,
  onRemoveSource,
}: {
  enabledSources: SourceId[] | null;
  selectedSources: SourceId[];
  onAddSource: (source: SourceId) => void;
  onRemoveSource: (source: SourceId) => void;
}) => {
  const visibleSources = availableSources.filter((source) =>
    enabledSources?.includes(source.id)
  );
  const remainingSources = visibleSources.filter(
    (source) => !selectedSources.includes(source.id)
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 px-2">
      {selectedSources.map((sourceId) => {
        const source = availableSources.find((item) => item.id === sourceId);

        if (!source) {
          return null;
        }

        return (
          <span
            className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-2 text-muted-foreground text-xs"
            key={source.id}
          >
            <img
              alt=""
              aria-hidden="true"
              className="size-3.5 shrink-0"
              src={integrationIcons[source.id]}
            />
            <span>{source.label}</span>
            <button
              aria-label={`Remove ${source.label}`}
              className="-mr-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onRemoveSource(source.id)}
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PromptInputButton>
            <PlusIcon className="size-4" />
            <span>Add source</span>
          </PromptInputButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>
            {selectedSources.length
              ? "Add another source"
              : "Choose sources for this query"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {enabledSources === null ? (
            <DropdownMenuItem disabled>Loading sources...</DropdownMenuItem>
          ) : remainingSources.length ? (
            remainingSources.map((source) => (
              <DropdownMenuItem
                className="items-start gap-2 py-2"
                key={source.id}
                onSelect={() => onAddSource(source.id)}
              >
                <img
                  alt=""
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                  src={integrationIcons[source.id]}
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">{source.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {source.description}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          ) : enabledSources.length ? (
            <DropdownMenuItem disabled>All sources added</DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>No enabled sources</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
 
    </div>
  );
};

const GenerativeToolOutput = ({
  errorText,
  input,
  output,
  showGenerativeToolUi,
  toolName,
}: {
  errorText: ToolPart["errorText"];
  input: ToolPart["input"];
  output: ToolPart["output"];
  showGenerativeToolUi: boolean;
  toolName: string;
}) => {
  if (!showGenerativeToolUi) {
    return null;
  }

  if (isSlackToolName(toolName) && errorText) {
    return (
      <div className="w-full">
        <SlackToolOutput
          errorText={errorText}
          input={input}
          output={output}
          toolName={toolName}
        />
      </div>
    );
  }

  if (errorText || !output) {
    return null;
  }

  if (isGmailToolName(toolName)) {
    return (
      <div className="w-full">
        <GmailToolOutput output={output} toolName={toolName} />
      </div>
    );
  }

  if (isGithubToolName(toolName)) {
    return (
      <div className="w-full">
        <GithubToolOutput output={output} toolName={toolName} />
      </div>
    );
  }

  if (isLinearToolName(toolName)) {
    return (
      <div className="w-full">
        <LinearToolOutput output={output} toolName={toolName} />
      </div>
    );
  }

  if (isGoogleCalendarToolName(toolName)) {
    return (
      <div className="w-full">
        <GoogleCalendarToolOutput output={output} toolName={toolName} />
      </div>
    );
  }

  if (isGoogleDriveToolName(toolName)) {
    return (
      <div className="w-full">
        <GoogleDriveToolOutput output={output} toolName={toolName} />
      </div>
    );
  }

  return null;
};

const PendingAssistantStatus = () => {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrase = pendingPhrases[phraseIndex % pendingPhrases.length];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % pendingPhrases.length);
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <Message from="assistant">
      <MessageContent>
        <div className="not-prose flex w-fit max-w-full items-center gap-2 text-muted-foreground">
          <span className="flex shrink-0 items-center gap-1">
            <img
              alt=""
              aria-hidden="true"
              className="size-4"
              src={integrationIcons.gmail}
            />
            <img
              alt=""
              aria-hidden="true"
              className="size-4"
              src={integrationIcons.slack}
            />
            <img
              alt=""
              aria-hidden="true"
              className="size-4"
              src={integrationIcons.github}
            />
            <img
              alt=""
              aria-hidden="true"
              className="size-4"
              src={integrationIcons.googleCalendar}
            />
          </span>
          <Shimmer
            as="span"
            className="truncate font-medium text-sm"
            duration={1.25}
            spread={1.1}
          >
            {phrase}
          </Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
};

function shouldShowPendingAssistant(
  messages: UIMessage[],
  status: ChatStatus
) {
  if (!(status === "submitted" || status === "streaming")) {
    return false;
  }

  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    return true;
  }

  if (lastMessage.role !== "assistant") {
    return true;
  }

  return !lastMessage.parts.some(
    (part) => part.type === "text" || isToolUIPart(part)
  );
}

const PageEditToolPart = ({
  isApplying,
  isBaselineCurrent,
  isDiffVisible,
  isReviewAvailable,
  onApply,
  onDiscard,
  onToggleChanges,
  onUndo,
  part,
  snapshot,
}: {
  isApplying: boolean;
  isBaselineCurrent: boolean;
  isDiffVisible: boolean;
  isReviewAvailable: boolean;
  onApply: (toolCallId: string) => void | Promise<void>;
  onDiscard: (toolCallId: string) => void | Promise<void>;
  onToggleChanges: (toolCallId: string) => void;
  onUndo: (toolCallId: string) => void | Promise<void>;
  part: ToolPart;
  snapshot: PageEditSnapshotPart | null;
}) => {
  const output = part.output as ProposePageContentUpdateOutput | undefined;
  const summary =
    output?.summary ??
    (typeof part.input === "object" &&
    part.input &&
    "summary" in part.input &&
    typeof part.input.summary === "string"
      ? part.input.summary
      : "Updated the page in page context.");
  const toolError =
    part.state === "output-error" || part.errorText
      ? part.errorText ?? "The page update tool failed."
      : null;

  if (
    part.state !== "output-available" &&
    part.state !== "output-error" &&
    !snapshot &&
    !isApplying
  ) {
    return null;
  }

  return (
    <PageEditCard
      isApplying={isApplying}
      isBaselineCurrent={isBaselineCurrent}
      isDiffVisible={isDiffVisible}
      isReviewAvailable={isReviewAvailable}
      onApply={() => onApply(part.toolCallId)}
      onDiscard={() => onDiscard(part.toolCallId)}
      onToggleChanges={() => onToggleChanges(part.toolCallId)}
      onUndo={() => onUndo(part.toolCallId)}
      snapshot={snapshot}
      summary={summary}
      toolError={toolError}
    />
  );
};

const ChatMessage = ({
  applyingToolCallIds,
  getPageEditBaselineCurrent,
  getPageEditReviewAvailable,
  message,
  onApplyPageEdit,
  onDiscardPageEdit,
  onTogglePageEditChanges,
  onUndoPageEdit,
  showGenerativeToolUi,
  snapshotByToolCallId,
  visibleDiffToolCallId,
}: {
  applyingToolCallIds: readonly string[];
  getPageEditBaselineCurrent: (
    snapshot: PageEditSnapshotPart,
  ) => boolean;
  getPageEditReviewAvailable: (
    snapshot: PageEditSnapshotPart,
  ) => boolean;
  message: UIMessage;
  onApplyPageEdit: (toolCallId: string) => void | Promise<void>;
  onDiscardPageEdit: (toolCallId: string) => void | Promise<void>;
  onTogglePageEditChanges: (toolCallId: string) => void;
  onUndoPageEdit: (toolCallId: string) => void | Promise<void>;
  showGenerativeToolUi: boolean;
  snapshotByToolCallId: Map<string, PageEditSnapshotPart>;
  visibleDiffToolCallId: string | null;
}) => {
  if (message.role === "system" || (message.role as string) === "data") {
    return null;
  }

  const partGroups = buildMessagePartGroups(message.parts);

  return (
    <Message from={message.role}>
      <MessageContent>
        {partGroups.map((group) => {
          if (group.type === "database-tools") {
            return (
              <DatabaseToolStepsGroup
                key={`${message.id}-db-${group.startIndex}`}
                parts={group.parts}
              />
            );
          }

          if (group.type === "integration-tools") {
            const slackAccessErrors = group.parts.filter(isSlackNotInChannelToolPart);
            const slackAccessChannels = slackAccessErrors
              .map((part) => getToolInputChannel(part.input))
              .filter((channel): channel is string => Boolean(channel));

            return (
              <IntegrationToolTaskGroup
                getToolPhrases={(toolName) => {
                  const title = toolTitles[toolName] ?? toolName;
                  return (
                    toolPhrases[toolName] ?? [
                      `Running ${title}`,
                      "Thinking through the tool call",
                      "Analyzing tool output",
                    ]
                  );
                }}
                getToolSource={(toolName) => toolSources[toolName]}
                getToolTitle={(toolName) => toolTitles[toolName] ?? toolName}
                key={`${message.id}-integration-${group.startIndex}`}
                parts={group.parts}
                renderGenerativeOutput={
                  showGenerativeToolUi
                    ? (part, toolName) => {
                        if (
                          isSlackNotInChannelToolPart(part) &&
                          isSlackToolName(toolName)
                        ) {
                          if (part !== slackAccessErrors[0]) {
                            return null;
                          }

                          return (
                            <SlackToolOutput
                              channels={slackAccessChannels}
                              errorText={part.errorText}
                              input={part.input}
                              toolName={toolName}
                            />
                          );
                        }

                        return (
                          <GenerativeToolOutput
                            errorText={part.errorText}
                            input={part.input}
                            output={part.output}
                            showGenerativeToolUi={showGenerativeToolUi}
                            toolName={toolName}
                          />
                        );
                      }
                    : undefined
                }
              />
            );
          }

          const { index, part } = group;

          if (part.type === "text") {
            return (
              <MessageResponse key={`${message.id}-${index}`}>
                {part.text}
              </MessageResponse>
            );
          }

          if (part.type === "reasoning") {
            return null;
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);

            if (isProposePageContentUpdateToolName(toolName)) {
              const snapshot =
                snapshotByToolCallId.get(part.toolCallId) ?? null;

              return (
                <PageEditToolPart
                  isApplying={
                    applyingToolCallIds.includes(part.toolCallId) &&
                    !snapshotByToolCallId.has(part.toolCallId)
                  }
                  isBaselineCurrent={
                    snapshot ? getPageEditBaselineCurrent(snapshot) : false
                  }
                  isDiffVisible={visibleDiffToolCallId === part.toolCallId}
                  isReviewAvailable={
                    snapshot ? getPageEditReviewAvailable(snapshot) : false
                  }
                  key={`${message.id}-${index}`}
                  onApply={onApplyPageEdit}
                  onDiscard={onDiscardPageEdit}
                  onToggleChanges={onTogglePageEditChanges}
                  onUndo={onUndoPageEdit}
                  part={part}
                  snapshot={snapshot}
                />
              );
            }

            return null;
          }

          return null;
        })}
      </MessageContent>
    </Message>
  );
};

function isSlackNotInChannelToolPart(part: ToolPart) {
  const staticToolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.replace(/^tool-/, "");

  return (
    isSlackToolName(staticToolName) &&
    Boolean(part.errorText?.includes("not_in_channel"))
  );
}

function getToolInputChannel(input: ToolPart["input"]) {
  if (!input || typeof input !== "object" || !("channel" in input)) {
    return undefined;
  }

  const channel = input.channel;
  return typeof channel === "string" && channel.trim()
    ? channel.trim()
    : undefined;
}

const EmptyState = () => (
  <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-5 px-4 pb-6 text-center">
    <div className="flex size-12 items-center justify-center rounded-md border bg-background shadow-sm">
      <InboxIcon className="size-6 text-muted-foreground" />
    </div>
    <div className="space-y-2">
      <h2 className="font-semibold text-xl">Ask AI about your page</h2>
      <p className="mx-auto max-w-xl text-muted-foreground text-sm">
        The assistant can search connected Gmail, GitHub, Google Calendar,
        Slack, and Linear context, then answer with project details and insights.
      </p>
    </div>
  </div>
);

type ChatbotProps = {
  databaseId?: string | null;
  isSidebar?: boolean;
  threadId: string;
  pageId?: string | null;
};

type SeededInitialMessages = {
  key: string;
  messages: UIMessage[];
  ready: boolean;
};

const Chatbot = (props: ChatbotProps) => {
  const { apiFetch } = useNotelabFeatures();
  const workspaceId = useActiveWorkspaceId();
  const threadMessagesQuery = useQuery(
    aiChatThreadMessagesQueryOptions(apiFetch, workspaceId, props.threadId),
  );
  const initialMessagesKey = `${workspaceId ?? "no-workspace"}:${props.threadId}`;
  const queriedInitialMessages =
    threadMessagesQuery.data?.messages ?? emptyAgentChatMessages;
  const [seededInitialMessages, setSeededInitialMessages] =
    useState<SeededInitialMessages>(() => ({
      key: initialMessagesKey,
      messages: emptyAgentChatMessages,
      ready: false,
    }));

  useEffect(() => {
    if (threadMessagesQuery.isLoading) {
      return;
    }

    setSeededInitialMessages((current) => {
      if (current.ready && current.key === initialMessagesKey) {
        return current;
      }

      return {
        key: initialMessagesKey,
        messages: queriedInitialMessages,
        ready: true,
      };
    });
  }, [
    initialMessagesKey,
    queriedInitialMessages,
    threadMessagesQuery.isLoading,
  ]);

  if (
    threadMessagesQuery.isLoading ||
    !seededInitialMessages.ready ||
    seededInitialMessages.key !== initialMessagesKey
  ) {
    return (
      <div className="flex min-h-40 items-center justify-center text-muted-foreground text-sm">
        Loading chat...
      </div>
    );
  }

  return (
    <ChatbotInner
      {...props}
      initialMessages={seededInitialMessages.messages}
      key={initialMessagesKey}
    />
  );
};

const ChatbotInner = ({
  databaseId = null,
  initialMessages,
  isSidebar = false,
  threadId,
  pageId = null,
}: ChatbotProps & {
  initialMessages: UIMessage[];
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const showGenerativeToolUi = useGenerativeToolUiEnabled();

  const [model, setModel] = useState<string>(fallbackModels[0].id);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<SourceId[]>([]);
  const [text, setText] = useState<string>("");
  const [textCursor, setTextCursor] = useState(0);
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [primaryDismissed, setPrimaryDismissed] = useState(false);
  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(
    null,
  );
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentionMenuEntries, setMentionMenuEntries] = useState<
    ContextAttachMenuEntry[]
  >([]);
  const mentionMenuRef = useRef<ContextAttachMenuHandle | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceId = useActiveWorkspaceId();
  const primarySource = useMemo<ContextSourceRef | null>(() => {
    if (pageId) {
      return { type: "page", id: pageId, role: "primary" };
    }

    if (databaseId) {
      return { type: "database", id: databaseId, role: "primary" };
    }

    return null;
  }, [databaseId, pageId]);
  const effectivePrimarySource = primaryDismissed ? null : primarySource;
  const { data: pages = [] } = usePages(workspaceId, {
    enabled: isSidebar && Boolean(workspaceId),
  });
  const { data: pageAccessLevel } = usePageAccessLevel(
    isSidebar ? pageId : null,
    {
      refetchOnMount: false,
    },
  );
  const { data: databasePayload } = useDatabase(databaseId);
  const primaryAttachment = useMemo(() => {
    if (!effectivePrimarySource) {
      return null;
    }

    const databaseConfig = databasePayload?.database.config;
    const databaseEmoji =
      databaseConfig &&
      typeof databaseConfig === "object" &&
      !Array.isArray(databaseConfig) &&
      typeof (databaseConfig as { emoji?: unknown }).emoji === "string"
        ? ((databaseConfig as { emoji: string }).emoji)
        : null;

    return (
      buildPrimaryAttachment({
        databaseEmoji,
        databaseName: databasePayload?.database.name,
        primarySource: effectivePrimarySource,
        pages,
      }) ?? {
        emoji: databaseEmoji,
        id: effectivePrimarySource.id,
        path: "",
        title:
          effectivePrimarySource.type === "database"
            ? databasePayload?.database.name?.trim() || "Database"
            : "Current page",
        type: effectivePrimarySource.type,
      }
    );
  }, [databasePayload, effectivePrimarySource, pages]);
  const { error: contextError, isLoading: isContextLoading, markdown: pageContext } =
    usePageAiContext({
      attachments,
      enabled: isSidebar && Boolean(workspaceId),
      workspaceId,
      primarySource: effectivePrimarySource,
    });
  const integrationsQuery = useIntegrations();
  const aiModelsQuery = useWorkspaceAiModels();
  const models = useMemo(() => {
    const queryModels = aiModelsQuery.data?.models ?? [];

    return queryModels.length ? queryModels : fallbackModels;
  }, [aiModelsQuery.data?.models]);
  const enabledSources = useMemo<SourceId[] | null>(() => {
    const statuses = integrationsQuery.data;

    if (!statuses && integrationsQuery.isLoading) {
      return null;
    }

    return [
      ...(statuses?.gmail?.connected ? (["gmail"] as const) : []),
      ...(statuses?.github?.connected ? (["github"] as const) : []),
      ...(statuses?.googleCalendar?.connected
        ? (["google-calendar"] as const)
        : []),
      ...(statuses?.googleDrive?.connected ? (["google-drive"] as const) : []),
      ...(statuses?.slack?.connected ? (["slack"] as const) : []),
      ...(statuses?.linear?.connected ? (["linear"] as const) : []),
    ];
  }, [integrationsQuery.data, integrationsQuery.isLoading]);

  const selectedModelData = useMemo(
    () => models.find((m) => m.id === model),
    [models, model]
  );
  const chefs = useMemo(
    () => Array.from(new Set(models.map((item) => item.chef))),
    [models]
  );

  useEffect(() => {
    setModel((current) =>
      models.some((item) => item.id === current) ? current : models[0].id
    );
  }, [models]);

  useEffect(() => {
    setAttachments([]);
    setDismissedMentionKey(null);
    setPrimaryDismissed(false);
    setSelectedMentionIndex(0);
    setTextCursor(0);
  }, [databaseId, pageId]);

  const mentionTrigger = useMemo(
    () => parseMentionState(text, textCursor),
    [text, textCursor],
  );
  const mentionKey = mentionTrigger
    ? `${mentionTrigger.mentionStart}:${mentionTrigger.mentionQuery}`
    : null;
  const activeMentionTrigger =
    mentionTrigger && mentionKey !== dismissedMentionKey ? mentionTrigger : null;
  const mentionMenuOpen = Boolean(activeMentionTrigger);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [activeMentionTrigger?.mentionQuery]);

  useEffect(() => {
    if (!isSidebar || isContextLoading) {
      return;
    }

    logPageContextRebuild({
      attachmentCount: attachments.length,
      charCount: pageContext.length,
      buildMs: 0,
    });
  }, [attachments.length, isContextLoading, isSidebar, pageContext]);

  useEffect(() => {
    if (!enabledSources) {
      return;
    }

    setSelectedSources((current) =>
      current.filter((source) => enabledSources.includes(source))
    );
  }, [enabledSources]);

  const { queryClient } = useNotelabFeatures();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const isAgentReady = Boolean(workspaceId && userId && threadId);
  const agentName = isAgentReady
    ? `org-${workspaceId}-user-${userId}-thread-${threadId}`
    : "chat-not-ready";

  const { getEditorHandle } = usePageEditorRegistry();
  const { commitPageEdit, undoPageEdit } = usePageEditApplier();
  const [visibleDiffToolCallId, setVisibleDiffToolCallId] = useState<string | null>(
    null,
  );

  const allowedPageIds = useMemo(() => {
    const ids = new Set<string>();

    if (effectivePrimarySource?.type === "page") {
      ids.add(effectivePrimarySource.id);
    }

    for (const attachment of attachments) {
      if (attachment.type === "page") {
        ids.add(attachment.id);
      }
    }

    return [...ids];
  }, [attachments, effectivePrimarySource]);

  const canEditPages = Boolean(
    isSidebar &&
      pageId &&
      (pageAccessLevel === "edit" || pageAccessLevel === "full"),
  );

  const threadMessagesQueryKey = useMemo(
    () =>
      workspaceId && threadId
        ? aiChatThreadMessagesQueryKey(workspaceId, threadId)
        : null,
    [workspaceId, threadId],
  );

  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<UIMessage>({
    experimental_throttle: 50,
    id: agentName,
    messages: initialMessages,
    onError: (chatError) => {
      logAiChatError("useChat onError", chatError, {
        agentName,
        canEditPages,
        isAgentReady,
        isSidebar,
        workspaceId,
        threadId,
        userId,
        pageContextChars: pageContext.length,
        pageId,
      });
      toast.error("Ask AI failed", {
        description: chatError.message,
      });
    },
    transport: new DefaultChatTransport<UIMessage>({
      api: toApiUrl("/api/ai/chat"),
      body: () => ({
        model,
        sources: selectedSources,
        threadId,
        ...(workspaceId ? { workspaceId } : {}),
        ...(userId ? { userId } : {}),
        ...(pageContext ? { pageContext } : {}),
        allowedPageIds,
        canEditPages,
        pageContextMeta: pageContext
          ? {
              attachmentIds: attachments.map((item) => item.id),
              charCount: pageContext.length,
              primaryId: effectivePrimarySource?.id ?? null,
            }
          : undefined,
      }),
      credentials: "include",
      headers: () => {
        const headers = getApiRequestHeaders();

        if (workspaceId) {
          headers.set("x-notelab-workspace-id", workspaceId);
        }

        return headers;
      },
    }),
  });

  const debugContextRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    debugContextRef.current = {
      agentName,
      databaseId,
      isAgentReady,
      isSidebar,
      messageSummary: summarizeMessagesForDebug(messages),
      workspaceId,
      status,
      threadId,
      userId,
      pageContextChars: pageContext.length,
      pageId,
    };
  }, [
    agentName,
    databaseId,
    isAgentReady,
    isSidebar,
    messages,
    workspaceId,
    status,
    threadId,
    userId,
    pageContext.length,
    pageId,
  ]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      logAiChatError("window error", event.error ?? event.message, {
        ...debugContextRef.current,
        colno: event.colno,
        filename: event.filename,
        lineno: event.lineno,
        message: event.message,
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logAiChatError("unhandled rejection", event.reason, debugContextRef.current);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    setText("");
    setTextCursor(0);
    setAttachments([]);
    setPrimaryDismissed(false);
    setDismissedMentionKey(null);
    setSelectedMentionIndex(0);
    setMentionMenuEntries([]);
    setVisibleDiffToolCallId(null);
    previousMessageCountRef.current = 0;
  }, [threadId]);

  useEffect(() => {
    if (!isSidebar) {
      return;
    }

    logPageEdit("chat:page-edit-config", {
      allowedPageIds,
      canEditPages,
      primaryPageId: effectivePrimarySource?.type === "page"
        ? effectivePrimarySource.id
        : null,
      pageAccessLevel: pageAccessLevel ?? null,
      pageContextChars: pageContext.length,
      pageId,
    });
  }, [
    allowedPageIds,
    canEditPages,
    effectivePrimarySource,
    isSidebar,
    pageAccessLevel,
    pageContext.length,
    pageId,
  ]);

  const getContextPageMarkdown = useCallback(
    (targetPageId: string) =>
      pageContext
        ? extractPageMarkdownFromContext(pageContext, targetPageId)
        : null,
    [pageContext],
  );

  const { applyingToolCallIds } = usePageEditAutoApply({
    enabled: isSidebar && canEditPages,
    getContextPageMarkdown,
    messages,
    setMessages,
  });

  useDatabaseToolCacheSync({
    enabled: isSidebar && canEditPages,
    messages,
  });

  useDatabaseEmbedAutoApply({
    enabled: isSidebar && canEditPages,
    messages,
  });

  const snapshotByToolCallId = useMemo(
    () => buildPageEditSnapshotMap(messages),
    [messages],
  );

  const visibleMessages = useMemo(
    () =>
      dedupeChatMessagesById(
        messages.filter(
          (message) => message.role === "user" || message.role === "assistant",
        ),
      ),
    [messages],
  );

  useEffect(() => {
    if (
      !threadMessagesQueryKey ||
      status === "submitted" ||
      status === "streaming" ||
      messages.length === 0
    ) {
      return;
    }

    queryClient.setQueryData<AiChatThreadMessagesResponse>(
      threadMessagesQueryKey,
      (current) => {
        if (!current) {
          return current;
        }

        if (areMessagesEquivalent(current.messages, messages)) {
          return current;
        }

        return { ...current, messages };
      },
    );
  }, [
    messages,
    queryClient,
    status,
    threadMessagesQueryKey,
  ]);

  const getPageEditBaselineCurrent = useCallback(
    (snapshot: PageEditSnapshotPart) => {
      const handle = getEditorHandle(snapshot.pageId);
      const currentContentJson = handle?.getContentJson() ?? null;

      return isPageEditBaselineCurrent(
        snapshot.beforeContentJson,
        currentContentJson,
        {
          baselineMarkdown: snapshot.beforeMarkdown,
          currentMarkdown: currentContentJson
            ? prosemirrorToMarkdown(currentContentJson)
            : undefined,
        },
      );
    },
    [getEditorHandle],
  );

  const getPageEditReviewAvailable = useCallback(
    (snapshot: PageEditSnapshotPart) => {
      const handle = getEditorHandle(snapshot.pageId);
      const currentContentJson = handle?.getContentJson() ?? null;

      return isPageEditReviewAvailable(
        snapshot,
        currentContentJson,
        currentContentJson
          ? prosemirrorToMarkdown(currentContentJson)
          : undefined,
      );
    },
    [getEditorHandle],
  );

  const handleDiscardPageEdit = useCallback(
    (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || snapshot.status !== "preview") {
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "declined"),
      );
    },
    [
      getEditorHandle,
      setMessages,
      snapshotByToolCallId,
      visibleDiffToolCallId,
    ],
  );

  const handleApplyPageEdit = useCallback(
    async (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (
        !snapshot ||
        (snapshot.status !== "preview" && snapshot.status !== "undone")
      ) {
        return;
      }

      if (!getPageEditReviewAvailable(snapshot)) {
        toast.error("This update is no longer available", {
          description: "The page has changed since this suggestion was created.",
        });
        return;
      }

      const result = commitPageEdit({
        afterMarkdown: snapshot.afterMarkdown,
        pageId: snapshot.pageId,
      });

      if (!result.success) {
        toast.error("Apply failed", {
          description: result.errorMessage,
        });
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      const afterContentJson =
        getEditorHandle(snapshot.pageId)?.getContentJson() ?? null;

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "applied", {
          afterContentJson,
        }),
      );
    },
    [
      commitPageEdit,
      getEditorHandle,
      getPageEditReviewAvailable,
      setMessages,
      snapshotByToolCallId,
      visibleDiffToolCallId,
    ],
  );

  const handleTogglePageEditChanges = useCallback(
    (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot?.afterMarkdown) {
        return;
      }

      const handle = getEditorHandle(snapshot.pageId);

      if (!handle) {
        toast.error("Open the page in the editor to review this change.");
        return;
      }

      if (!getPageEditReviewAvailable(snapshot)) {
        toast.error("This update is no longer available", {
          description: "The page has changed since this suggestion was created.",
        });
        return;
      }

      if (
        visibleDiffToolCallId === toolCallId ||
        (handle.isEditDiffPreviewActive() &&
          handle.getActiveEditDiffToolCallId() === toolCallId)
      ) {
        handle.clearEditDiffPreview({ silent: true });
        setVisibleDiffToolCallId(null);
        return;
      }

      handle.clearEditDiffPreview({ silent: true });
      const shown = handle.showEditDiffPreview({
        afterMarkdown: snapshot.afterMarkdown,
        beforeMarkdown: snapshot.beforeMarkdown,
        toolCallId,
        useBeforeBaseline: snapshot.status === "applied",
      });

      if (!shown) {
        toast.error("Could not show changes in the editor.");
        return;
      }

      setVisibleDiffToolCallId(toolCallId);
      document
        .querySelector("[data-editor-surface]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [
      getEditorHandle,
      getPageEditReviewAvailable,
      snapshotByToolCallId,
      visibleDiffToolCallId,
    ],
  );

  const handleUndoPageEdit = useCallback(
    async (toolCallId: string) => {
      const snapshot = snapshotByToolCallId.get(toolCallId);

      if (!snapshot || snapshot.status !== "applied") {
        return;
      }

      const result = await undoPageEdit({
        beforeContentJson: snapshot.beforeContentJson,
        pageId: snapshot.pageId,
      });

      if (!result.success) {
        toast.error("Undo failed", {
          description: result.errorMessage,
        });
        return;
      }

      getEditorHandle(snapshot.pageId)?.clearEditDiffPreview({
        silent: true,
      });

      if (visibleDiffToolCallId === toolCallId) {
        setVisibleDiffToolCallId(null);
      }

      setMessages((currentMessages) =>
        updatePageEditSnapshotStatus(currentMessages, toolCallId, "undone"),
      );
    },
    [
      getEditorHandle,
      setMessages,
      snapshotByToolCallId,
      undoPageEdit,
      visibleDiffToolCallId,
    ],
  );

  useEffect(() => {
    if (!error) {
      return;
    }

    logAiChatError("useChat error state", error, debugContextRef.current);

    const timeout = window.setTimeout(() => {
      clearError();
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearError, error]);

  const submitText = useCallback(
    (content: string) => {
      if (!content.trim()) {
        return;
      }

      if (!isAgentReady) {
        toast.error("Ask AI failed", {
          description: "Sign in and select an active workspace before using AI.",
        });
        return;
      }

      logPageContextSent({
        attachmentCount: attachments.length,
        charCount: pageContext.length,
      });

      void sendMessage({
        text: content.trim(),
      });
      setText("");
      setTextCursor(0);
      setDismissedMentionKey(null);
    },
    [
      attachments.length,
      isAgentReady,
      sendMessage,
      pageContext,
    ]
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      submitText(message.text || "");
    },
    [submitText]
  );

  const existingAttachmentKeys = useMemo(() => {
    const keys = new Set(attachments.map((item) => getAttachmentKey(item)));

    if (effectivePrimarySource) {
      keys.add(getAttachmentKey(effectivePrimarySource));
    }

    return keys;
  }, [attachments, effectivePrimarySource]);

  const syncTextCursor = useCallback(() => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    setTextCursor(cursor);
  }, [text.length]);

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      const caretPosition = event.target.selectionStart ?? nextValue.length;

      setText(nextValue);
      setTextCursor(caretPosition);
      setDismissedMentionKey(null);
    },
    []
  );

  const clearMentionTrigger = useCallback(() => {
    if (!activeMentionTrigger) {
      return;
    }

    const before = text.slice(0, activeMentionTrigger.mentionStart);
    const after = text.slice(
      activeMentionTrigger.mentionStart +
        1 +
        activeMentionTrigger.mentionQuery.length,
    );
    const nextValue = `${before}${after}`.trimStart();

    setText(nextValue);
    setTextCursor(before.length);
    setDismissedMentionKey(null);
  }, [activeMentionTrigger, text]);

  const handleAttachContext = useCallback(
    (attachment: ContextAttachment) => {
      const key = getAttachmentKey(attachment);

      if (existingAttachmentKeys.has(key)) {
        clearMentionTrigger();
        return;
      }

      if (
        primarySource &&
        getAttachmentKey(primarySource) === key
      ) {
        setPrimaryDismissed(false);
        clearMentionTrigger();
        textareaRef.current?.focus();
        return;
      }

      setAttachments((current) => [...current, attachment]);
      clearMentionTrigger();
      textareaRef.current?.focus();
    },
    [clearMentionTrigger, existingAttachmentKeys, primarySource]
  );

  const handleRemovePrimary = useCallback(() => {
    setPrimaryDismissed(true);
  }, []);

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!mentionMenuOpen) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedMentionIndex((index) =>
          mentionMenuEntries.length
            ? (index + 1) % mentionMenuEntries.length
            : 0,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedMentionIndex((index) =>
          mentionMenuEntries.length
            ? (index - 1 + mentionMenuEntries.length) % mentionMenuEntries.length
            : 0,
        );
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedMentionKey(mentionKey);
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey
      ) {
        event.preventDefault();

        const selectedEntry = mentionMenuEntries[selectedMentionIndex];

        if (selectedEntry) {
          mentionMenuRef.current?.activateEntry(selectedEntry);
        } else {
          setDismissedMentionKey(mentionKey);
        }
      }
    },
    [
      mentionKey,
      mentionMenuEntries,
      mentionMenuOpen,
      selectedMentionIndex,
    ]
  );

  const handleRemoveAttachment = useCallback((attachment: ContextAttachment) => {
    setAttachments((current) =>
      current.filter(
        (item) => getAttachmentKey(item) !== getAttachmentKey(attachment),
      ),
    );
  }, []);

  const handleModelSelect = useCallback((modelId: string) => {
    setModel(modelId);
    setModelSelectorOpen(false);
  }, [setModel, setModelSelectorOpen]);

  const handleAddSource = useCallback((source: SourceId) => {
    setSelectedSources((current) =>
      current.includes(source) ? current : [...current, source]
    );
  }, []);

  const handleRemoveSource = useCallback((source: SourceId) => {
    setSelectedSources((current) =>
      current.filter((item) => item !== source)
    );
  }, []);

  const hasMessages = visibleMessages.length > 0;
  const showPendingAssistant =
    shouldShowPendingAssistant(messages, status);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    previousMessageCountRef.current = visibleMessages.length;

    if (!(previousMessageCount === 0 && visibleMessages.length > 0)) {
      return;
    }

    const scrollShell = rootRef.current?.closest(
      "[data-ai-scroll-shell]"
    ) as HTMLElement | null;

    window.requestAnimationFrame(() => {
      scrollShell?.scrollTo({
        behavior: "smooth",
        top: scrollShell.scrollHeight,
      });
    });
  }, [visibleMessages.length]);

  return (
    <div
      className={
        hasMessages || isSidebar
          ? "relative flex h-full min-h-0 flex-col"
          : "relative flex h-full min-h-0 flex-col justify-center"
      }
      ref={rootRef}
    >
      <Conversation
        className={
          hasMessages || isSidebar ? "min-h-0" : "flex-none overflow-visible"
        }
      >
        <ConversationContent
          className={
            hasMessages || isSidebar
              ? "px-0 pb-10 md:px-4"
              : "px-0 pb-0 md:px-4"
          }
        >
          {!hasMessages ? (
            <EmptyState />
          ) : (
            visibleMessages.map((message) => (
              <ChatMessage
                applyingToolCallIds={applyingToolCallIds}
                getPageEditBaselineCurrent={getPageEditBaselineCurrent}
                getPageEditReviewAvailable={getPageEditReviewAvailable}
                key={message.id}
                message={message}
                onApplyPageEdit={handleApplyPageEdit}
                onDiscardPageEdit={handleDiscardPageEdit}
                onTogglePageEditChanges={handleTogglePageEditChanges}
                onUndoPageEdit={handleUndoPageEdit}
                showGenerativeToolUi={showGenerativeToolUi}
                snapshotByToolCallId={snapshotByToolCallId}
                visibleDiffToolCallId={visibleDiffToolCallId}
              />
            ))
          )}
          {showPendingAssistant ? <PendingAssistantStatus /> : null}
        </ConversationContent>
      </Conversation>
      <div
        className={
          hasMessages || isSidebar
            ? "sticky bottom-0 z-10 -mx-4 mt-auto grid shrink-0 gap-3 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-16 md:mx-0 md:px-4 md:pb-6 md:pt-20"
            : "z-10 -mx-4 grid shrink-0 gap-3 px-4 pb-4 md:mx-0 md:px-4"
        }
      >
        <ShellScrollButton targetRef={rootRef} />
        <div className="mx-auto w-full max-w-3xl">
          {isSidebar ? (
            <div className="mb-2 px-1 text-xs text-muted-foreground">
              {isContextLoading
                ? "Loading page context..."
                : contextError
                  ? "Page context failed"
                  : pageContext
                    ? "Page context ready"
                    : null}
            </div>
          ) : null}
          <PromptInput
            inputGroupClassName="h-auto items-stretch overflow-visible focus-within:border-input focus-within:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0"
            onSubmit={handleSubmit}
          >
            <ContextAttachChips
              attachments={attachments}
              onRemove={handleRemoveAttachment}
              onRemovePrimary={handleRemovePrimary}
              primaryAttachment={primaryAttachment}
            />
            <div className="relative w-full min-w-0 flex-1 self-stretch">
              {mentionMenuOpen ? (
                <ContextAttachMenu
                  currentDatabaseId={databaseId}
                  currentPageId={pageId}
                  existingAttachmentKeys={existingAttachmentKeys}
                  onEntriesChange={setMentionMenuEntries}
                  onSelect={handleAttachContext}
                  open={mentionMenuOpen}
                  query={activeMentionTrigger?.mentionQuery ?? ""}
                  ref={mentionMenuRef}
                  selectedIndex={selectedMentionIndex}
                  setSelectedIndex={setSelectedMentionIndex}
                />
              ) : null}
              <PromptInputTextarea
                className="w-full px-2 focus-visible:border-transparent focus-visible:ring-0"
                onChange={handleTextChange}
                onClick={syncTextCursor}
                onKeyDown={handleTextareaKeyDown}
                onSelect={syncTextCursor}
                placeholder="Ask about your page, or type @ to attach pages and databases..."
                ref={textareaRef}
                value={text}
              />
            </div>
            <PromptInputFooter>
              <PromptInputTools>
                <SourceSelector
                  enabledSources={enabledSources}
                  selectedSources={selectedSources}
                  onAddSource={handleAddSource}
                  onRemoveSource={handleRemoveSource}
                />
                <ModelSelector
                  onOpenChange={setModelSelectorOpen}
                  open={modelSelectorOpen}
                >
                  <ModelSelectorTrigger asChild>
                    <PromptInputButton>
                      {selectedModelData?.chefSlug && (
                        <ModelSelectorLogo
                          provider={getProviderLogoSlug(selectedModelData.chefSlug)}
                        />
                      )}
                      {selectedModelData?.name && (
                        <ModelSelectorName>
                          {selectedModelData.name}
                        </ModelSelectorName>
                      )}
                    </PromptInputButton>
                  </ModelSelectorTrigger>
                  <ModelSelectorContent>
                    <ModelSelectorInput placeholder="Search models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      {chefs.map((chef) => (
                        <ModelSelectorGroup heading={chef} key={chef}>
                          {models
                            .filter((m) => m.chef === chef)
                            .map((m) => (
                              <ModelItem
                                isSelected={model === m.id}
                                key={m.id}
                                m={m}
                                onSelect={handleModelSelect}
                              />
                            ))}
                        </ModelSelectorGroup>
                      ))}
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              </PromptInputTools>
              <PromptInputSubmit
                status={status as ChatStatus}
                onStop={stop}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
