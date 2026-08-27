import { AGENT_TOOL_DESCRIPTORS } from "@zilobase/features/ai-chat/tool-registry";

export type AgentCapabilityStatus = "available" | "forbidden" | "unavailable";

export type AgentCapability = {
  id: string;
  status: AgentCapabilityStatus;
  summary: string;
  toolNames: string[];
};

export type AgentCapabilityPolicy = {
  capabilities: AgentCapability[];
  hasCapability(id: string): boolean;
};

const alwaysAvailableCapabilities: AgentCapability[] = [
  {
    id: "file.read",
    status: "available",
    summary:
      "Read owned, expiring chat uploads after server-side validation and bounded extraction.",
    toolNames: toolNamesFor("file.read"),
  },
  {
    id: "data.analyze",
    status: "available",
    summary: "Run bounded deterministic calculations over supplied tabular data.",
    toolNames: toolNamesFor("data.analyze"),
  },
  {
    id: "workspace.search",
    status: "available",
    summary: "Search pages and databases the current user can view.",
    toolNames: toolNamesFor("workspace.search"),
  },
  {
    id: "page.read",
    status: "available",
    summary: "Read pages the current user can view.",
    toolNames: toolNamesFor("page.read"),
  },
  {
    id: "page.comments.read",
    status: "available",
    summary: "Read comments on pages the current user can view.",
    toolNames: toolNamesFor("page.comments.read"),
  },
  {
    id: "database.query",
    status: "available",
    summary: "Query databases the current user can view.",
    toolNames: toolNamesFor("database.query"),
  },
];

const unavailableCapabilities: AgentCapability[] = [
  {
    id: "page.revisions.read",
    status: "unavailable",
    summary: "Page revision history is not retained by this installation.",
    toolNames: [],
  },
  {
    id: "inbox.manage",
    status: "unavailable",
    summary: "Zilobase Inbox is not available.",
    toolNames: [],
  },
  {
    id: "database.map-view.configure",
    status: "unavailable",
    summary: "Zilobase does not currently implement database map views.",
    toolNames: [],
  },
];

const forbiddenCapabilities: AgentCapability[] = [
  {
    id: "code.arbitrary.execute",
    status: "forbidden",
    summary:
      "Do not execute arbitrary code, use the host filesystem, or make unrestricted network requests for analysis.",
    toolNames: [],
  },
  {
    id: "embed.non-pdf.read",
    status: "forbidden",
    summary: "Do not claim to read content hidden inside non-PDF embeds.",
    toolNames: [],
  },
  {
    id: "database.advanced.create",
    status: "forbidden",
    summary:
      "Do not create database automations, templates, page layouts, formula, rollup, or button properties.",
    toolNames: [],
  },
  {
    id: "page.comments.mutate",
    status: "forbidden",
    summary: "Do not create, edit, resolve, delete, or react to comments.",
    toolNames: [],
  },
  {
    id: "page.permissions.mutate",
    status: "forbidden",
    summary: "Do not share content or change page/database permissions.",
    toolNames: [],
  },
  {
    id: "meeting.start",
    status: "forbidden",
    summary: "Do not start AI Meeting Notes.",
    toolNames: [],
  },
  {
    id: "reminder.create",
    status: "forbidden",
    summary: "Do not create reminders.",
    toolNames: [],
  },
  {
    id: "workspace.settings.mutate",
    status: "forbidden",
    summary:
      "Do not change workspace settings, roles, billing, security, or AI model configuration.",
    toolNames: [],
  },
];

export function resolveAgentCapabilityPolicy(input: {
  canEditAttachedPages: boolean;
}) {
  const nativeMutationCapabilities: AgentCapability[] = [
    {
      id: "artifact.create",
      status: "available",
      summary:
        "Create expiring downloadable artifacts in supported document and data formats.",
      toolNames: toolNamesFor("artifact.create"),
    },
    {
      id: "page.content.update",
      status: "available",
      summary:
        "Update accessible pages durably, or propose reviewed edits for an attached open page.",
      toolNames: toolNamesFor("page.content.update").filter(
        (name) => name !== "proposePageContentUpdate" || input.canEditAttachedPages,
      ),
    },
    {
      id: "page-database.configure",
      status: "available",
      summary:
        "Create supported pages and configure pages/databases after item-level edit checks.",
      toolNames: toolNamesFor("page-database.configure"),
    },
  ];
  const capabilities = [
    ...alwaysAvailableCapabilities,
    ...nativeMutationCapabilities,
    ...unavailableCapabilities,
    ...forbiddenCapabilities,
  ];

  return {
    capabilities,
    hasCapability(id: string) {
      return capabilities.some(
        (capability) => capability.id === id && capability.status === "available",
      );
    },
  } satisfies AgentCapabilityPolicy;
}

function toolNamesFor(capability: string) {
  return AGENT_TOOL_DESCRIPTORS
    .filter((descriptor) => descriptor.capability === capability)
    .map((descriptor) => descriptor.name);
}

export function buildAgentPolicyInstruction(policy: AgentCapabilityPolicy) {
  const restricted = policy.capabilities.filter(
    (capability) => capability.status !== "available",
  );

  return [
    "## Capability boundaries",
    "Only claim that an action or read succeeded after a tool returns success. Never invent tool access.",
    ...restricted.map(
      (capability) =>
        `- ${capability.id} (${capability.status}): ${capability.summary}`,
    ),
  ].join("\n");
}
