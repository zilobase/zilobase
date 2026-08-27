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
    id: "workspace.search",
    status: "available",
    summary: "Search pages and databases the current user can view.",
    toolNames: ["searchWorkspace"],
  },
  {
    id: "page.read",
    status: "available",
    summary: "Read pages the current user can view.",
    toolNames: ["readWorkspacePage"],
  },
  {
    id: "page.comments.read",
    status: "available",
    summary: "Read comments on pages the current user can view.",
    toolNames: ["readPageComments"],
  },
  {
    id: "database.query",
    status: "available",
    summary: "Query databases the current user can view.",
    toolNames: ["queryWorkspaceDatabase"],
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
];

const forbiddenCapabilities: AgentCapability[] = [
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
      "Do not change workspace settings, roles, billing, security, provider credentials, or connections.",
    toolNames: [],
  },
];

export function resolveAgentCapabilityPolicy(input: {
  canEditAttachedPages: boolean;
}) {
  const nativeMutationCapabilities: AgentCapability[] = [
    {
      id: "page.content.update",
      status: input.canEditAttachedPages ? "available" : "unavailable",
      summary: input.canEditAttachedPages
        ? "Update content on attached pages after server-side access checks."
        : "No attached page is editable by the current user.",
      toolNames: input.canEditAttachedPages
        ? ["proposePageContentUpdate"]
        : [],
    },
    {
      id: "page-database.configure",
      status: input.canEditAttachedPages ? "available" : "unavailable",
      summary: input.canEditAttachedPages
        ? "Create supported pages, databases, properties, views, and rows."
        : "Page and database configuration requires edit access to an attached page.",
      toolNames: input.canEditAttachedPages
        ? [
            "createPage",
            "createDatabase",
            "embedDatabaseInPage",
            "linkDatabaseInPage",
            "createDatabaseProperty",
            "updateDatabaseProperty",
            "createDatabaseView",
            "updateDatabaseView",
            "updateDataSource",
            "createDatabaseRow",
            "setDatabaseCellValue",
          ]
        : [],
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
