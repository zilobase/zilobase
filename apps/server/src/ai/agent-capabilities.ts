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
    toolNames: [],
  },
  {
    id: "data.analyze",
    status: "available",
    summary: "Run bounded deterministic calculations over supplied tabular data.",
    toolNames: ["analyzeDataTable"],
  },
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
    id: "connected-apps.read",
    status: "unavailable",
    summary:
      "External connected-app reads are unavailable until native provider adapters are implemented and configured.",
    toolNames: [],
  },
  {
    id: "connected-apps.mutate",
    status: "unavailable",
    summary:
      "External connected-app actions are unavailable until native provider adapters and confirmation receipts are implemented.",
    toolNames: [],
  },
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
      "Do not change workspace settings, roles, billing, security, provider credentials, or connections.",
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
      toolNames: ["createDownloadableArtifact"],
    },
    {
      id: "page.content.update",
      status: "available",
      summary:
        "Update accessible pages durably, or propose reviewed edits for an attached open page.",
      toolNames: [
        "updateWorkspacePage",
        ...(input.canEditAttachedPages ? ["proposePageContentUpdate"] : []),
      ],
    },
    {
      id: "page-database.configure",
      status: "available",
      summary:
        "Create supported pages and configure pages/databases after item-level edit checks.",
      toolNames: [
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
      ],
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
