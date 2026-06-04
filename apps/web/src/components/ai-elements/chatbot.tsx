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
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toApiUrl } from "@/lib/api";
import {
  useActiveOrganizationId,
  useIntegrations,
  useOrganizationAiModels,
} from "@/features/integrations/hooks";
import type { OrganizationAiChatModel } from "@/features/integrations/queries";
import { integrationIcons } from "@/lib/integration-icons";
import { useChat } from "@ai-sdk/react";
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
  isToolUIPart,
} from "ai";
import { ArrowDownIcon, CheckIcon, InboxIcon, PlusIcon, XIcon } from "lucide-react";
import {
  useGenerativeToolUiEnabled,
  useToolOutputUiEnabled,
} from "@/lib/debug-settings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const fallbackModels: OrganizationAiChatModel[] = [
  {
    chef: "Cloudflare Workers AI",
    chefSlug: "cloudflare-workers-ai",
    gatewayId: "@cf/openai/gpt-oss-120b",
    id: "@cf/openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    providers: ["cloudflare-workers-ai"],
  },
  {
    chef: "Cloudflare Workers AI",
    chefSlug: "cloudflare-workers-ai",
    gatewayId: "@cf/openai/gpt-oss-20b",
    id: "@cf/openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    providers: ["cloudflare-workers-ai"],
  },
  {
    chef: "Cloudflare Workers AI",
    chefSlug: "cloudflare-workers-ai",
    gatewayId: "@cf/moonshotai/kimi-k2.5",
    id: "@cf/moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    providers: ["cloudflare-workers-ai"],
  },
  {
    chef: "Cloudflare Workers AI",
    chefSlug: "cloudflare-workers-ai",
    gatewayId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    name: "Llama 3.3 70B",
    providers: ["cloudflare-workers-ai"],
  },
  {
    chef: "Cloudflare Workers AI",
    chefSlug: "cloudflare-workers-ai",
    gatewayId: "@cf/zai-org/glm-4.7-flash",
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM 4.7 Flash",
    providers: ["cloudflare-workers-ai"],
  },
];

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
    description: "Workspace channels, threads, canvases, and files.",
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
    "Checking the Linear workspace",
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
    "Checking the Slack workspace",
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

const toolFinishedPhrases: Partial<Record<ToolPart["state"], string>> = {
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const pendingPhrases = [
  "Thinking through your question",
  "Analyzing workspace context",
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

async function fetchWithJsonErrors(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (response.ok) {
    return response;
  }

  let message = `Ask AI request failed with status ${response.status}`;

  try {
    const body = await response.clone().json();

    if (typeof body?.message === "string") {
      message = body.message;
    }
  } catch {
    const text = await response.text();

    if (text) {
      message = text;
    }
  }

  throw new Error(message);
}

function withOrganizationHeader(
  init: RequestInit | undefined,
  organizationId: string | null | undefined,
) {
  if (!organizationId) {
    return init;
  }

  const headers = new Headers(init?.headers);

  headers.set("x-notelab-organization-id", organizationId);

  return { ...init, headers };
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
  m: OrganizationAiChatModel;
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
      {!selectedSources.length ? (
        <span className="text-muted-foreground/70 text-xs">
          No source selected: all enabled sources can be used.
        </span>
      ) : null}
    </div>
  );
};

const IntegrationToolPart = ({
  part,
  showGenerativeToolUi,
  showToolOutputUi,
}: {
  part: ToolPart;
  showGenerativeToolUi: boolean;
  showToolOutputUi: boolean;
}) => {
  const staticToolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.replace(/^tool-/, "");
  const title = toolTitles[staticToolName] ?? staticToolName;
  const hasRichToolOutput =
    showGenerativeToolUi &&
    part.state === "output-available" &&
    !part.errorText &&
    Boolean(part.output) &&
    (isGmailToolName(staticToolName) ||
      isGithubToolName(staticToolName) ||
      isGoogleCalendarToolName(staticToolName) ||
      isGoogleDriveToolName(staticToolName) ||
      isLinearToolName(staticToolName) ||
      isSlackToolName(staticToolName));

  return (
    <div className="not-prose mb-3 space-y-2">
      {hasRichToolOutput ? null : (
        <IntegrationToolStatus
          state={part.state}
          title={title}
          toolName={staticToolName}
        />
      )}
      <GenerativeToolOutput
        errorText={part.errorText}
        input={part.input}
        output={part.output}
        showGenerativeToolUi={showGenerativeToolUi}
        toolName={staticToolName}
      />
      {showToolOutputUi ? (
        <Tool defaultOpen={part.state !== "output-available"}>
          {part.type === "dynamic-tool" ? (
            <ToolHeader
              state={part.state}
              title={title}
              toolName={part.toolName}
              type={part.type}
            />
          ) : (
            <ToolHeader state={part.state} title={title} type={part.type} />
          )}
          <ToolContent>
            <ToolInput input={part.input} />
            <ToolOutput errorText={part.errorText} output={part.output} />
          </ToolContent>
        </Tool>
      ) : null}
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

const IntegrationToolStatus = ({
  state,
  title,
  toolName,
}: {
  state: ToolPart["state"];
  title: string;
  toolName: string;
}) => {
  const phrases = toolPhrases[toolName] ?? [
    `Running ${title}`,
    "Thinking through the tool call",
    "Analyzing tool output",
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const source = toolSources[toolName];
  const finishedPhrase = toolFinishedPhrases[state];
  const phrase = finishedPhrase
    ? `${finishedPhrase}: ${title}`
    : phrases[phraseIndex % phrases.length];

  useEffect(() => {
    if (finishedPhrase || phrases.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % phrases.length);
    }, 1700);

    return () => {
      window.clearInterval(interval);
    };
  }, [finishedPhrase, phrases.length]);

  return (
    <div className="not-prose mb-1.5 flex w-fit max-w-full items-center gap-2 text-muted-foreground">
      {source ? (
        <img
          alt=""
          aria-hidden="true"
          className="size-4 shrink-0"
          src={integrationIcons[source]}
        />
      ) : (
        <span className="size-2 shrink-0 rounded-full bg-muted-foreground/60" />
      )}
      {finishedPhrase ? (
        <span className="truncate font-medium text-sm">{phrase}</span>
      ) : (
        <Shimmer
          as="span"
          className="truncate font-medium text-sm"
          duration={1.35}
          spread={1.1}
        >
          {phrase}
        </Shimmer>
      )}
    </div>
  );
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

const ChatMessage = ({
  message,
  showGenerativeToolUi,
  showToolOutputUi,
}: {
  message: UIMessage;
  showGenerativeToolUi: boolean;
  showToolOutputUi: boolean;
}) => {
  if (message.role === "system") {
    return null;
  }

  const slackAccessErrors = message.parts
    .filter(isToolUIPart)
    .filter(isSlackNotInChannelToolPart);
  const firstSlackAccessError = slackAccessErrors[0];
  const firstSlackAccessErrorIndex = firstSlackAccessError
    ? message.parts.indexOf(firstSlackAccessError)
    : -1;
  const slackAccessChannels = slackAccessErrors
    .map((part) => getToolInputChannel(part.input))
    .filter((channel): channel is string => Boolean(channel));

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>;
          }

          if (part.type === "reasoning") {
            return null;
          }

          if (isToolUIPart(part)) {
            if (
              showGenerativeToolUi &&
              !showToolOutputUi &&
              isSlackNotInChannelToolPart(part)
            ) {
              if (index !== firstSlackAccessErrorIndex) {
                return null;
              }

              const staticToolName =
                part.type === "dynamic-tool"
                  ? part.toolName
                  : part.type.replace(/^tool-/, "");
              return (
                <div
                  className="not-prose mb-3 space-y-2"
                  key={`${message.id}-${index}`}
                >
                  {isSlackToolName(staticToolName) ? (
                    <div className="w-full">
                      <SlackToolOutput
                        channels={slackAccessChannels}
                        errorText={part.errorText}
                        input={part.input}
                        toolName={staticToolName}
                      />
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <IntegrationToolPart
                key={`${message.id}-${index}`}
                part={part}
                showGenerativeToolUi={showGenerativeToolUi}
                showToolOutputUi={showToolOutputUi}
              />
            );
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
      <h2 className="font-semibold text-xl">Ask AI about your workspace</h2>
      <p className="mx-auto max-w-xl text-muted-foreground text-sm">
        The assistant can search connected Gmail, GitHub, Google Calendar,
        Slack, and Linear context, then answer with project details and insights.
      </p>
    </div>
  </div>
);

const Chatbot = ({ isSidebar = false }: { isSidebar?: boolean }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const showGenerativeToolUi = useGenerativeToolUiEnabled();
  const showToolOutputUi = useToolOutputUiEnabled();
  const [model, setModel] = useState<string>(fallbackModels[0].id);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<SourceId[]>([]);
  const [text, setText] = useState<string>("");
  const organizationId = useActiveOrganizationId();
  const integrationsQuery = useIntegrations();
  const aiModelsQuery = useOrganizationAiModels();
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
    if (!enabledSources) {
      return;
    }

    setSelectedSources((current) =>
      current.filter((source) => enabledSources.includes(source))
    );
  }, [enabledSources]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: toApiUrl("/api/ai/ask"),
        credentials: "include",
        fetch: (input, init) =>
          fetchWithJsonErrors(input, withOrganizationHeader(init, organizationId)),
      }),
    [organizationId]
  );

  const { clearError, error, messages, sendMessage, status } = useChat({
    experimental_throttle: 80,
    onError: (chatError) => {
      toast.error("Ask AI failed", {
        description: chatError.message,
      });
    },
    transport,
  });

  useEffect(() => {
    if (!error) {
      return;
    }

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

      void sendMessage({
        text: content.trim(),
      }, {
        body: {
          model,
          sources: selectedSources,
        },
      });
      setText("");
    },
    [sendMessage, model, selectedSources, setText]
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      submitText(message.text || "");
    },
    [submitText]
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
    },
    [setText]
  );

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

  const isBusy = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const showPendingAssistant = shouldShowPendingAssistant(messages, status);

  useEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;

    if (!(previousMessageCount === 0 && messages.length > 0)) {
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
  }, [messages.length]);

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
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                showGenerativeToolUi={showGenerativeToolUi}
                showToolOutputUi={showToolOutputUi}
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
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                onChange={handleTextChange}
                placeholder="Ask Gmail, GitHub, Calendar, Slack, or Linear about project updates, blockers, timelines..."
                value={text}
              />
            </PromptInputBody>
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
                disabled={isBusy}
                status={status as ChatStatus}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
