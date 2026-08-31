import { and, eq, inArray } from "drizzle-orm";
import { hasPageBodyContent } from "@zilobase/features/pages/content-state";

import type { Database } from "../../infrastructure/database";
import {
  account,
  aiChatMessage,
  aiChatThread,
  apikey,
  database,
  databaseDataSource,
  databaseProperty,
  databaseRow,
  databaseView,
  dataSource,
  member,
  page,
  pageCollaborationDocument,
  pageItemPlacement,
  pageProperty,
  pagePropertyValue,
  pageSettings,
  teamspace,
  teamspacePrincipal,
  user,
  workspace,
  workspaceAiProviderConfig,
} from "../../infrastructure/database/schema";
import { markdownToPageContent } from "../ai/conversion/markdown-to-page-content";
import { DEMO_IDS, DEMO_SEED_VERSION } from "./constants";

const FIXED_DATE = new Date("2026-08-31T08:00:00.000Z");

const PAGE_DEFINITIONS = [
  {
    id: DEMO_IDS.pageStart,
    name: "Start here",
    markdown: `# Welcome to the Zilobase demo

This temporary workspace shows how pages, databases, tasks, and AI context fit together. Try editing this page or moving a launch task—the changes stay in this browser until you refresh.

## Explore the launch workspace

- [Read the launch brief](/p/${DEMO_IDS.pageLaunchBrief})
- [Review the research notes](/p/${DEMO_IDS.pageResearchNotes})
- [See the decision log](/p/${DEMO_IDS.pageDecisionLog})
- [Open the launch tracker](/d/${DEMO_IDS.database})

## Safe by design

Demo edits are never written to Zilobase. Actions that need a real account—sharing, creating content, integrations, uploads, and AI execution—will explain how to create a free workspace.`,
  },
  {
    id: DEMO_IDS.pageLaunchBrief,
    name: "Launch brief",
    markdown: `# Autumn launch brief

## Outcome

Help early-stage product teams understand that Zilobase keeps notes, structured work, and AI context in one open workspace.

## Audience

- Founders coordinating a small launch team
- Product and engineering leads replacing scattered docs
- Teams that need a self-hostable workspace

## Success signals

- Visitors reach the live workspace from the landing page
- The product model is clear without a sales call
- New workspaces begin with one useful page and one useful database

## Launch constraints

Keep the story specific, avoid invented customer claims, and preserve a fast first render on mobile.`,
  },
  {
    id: DEMO_IDS.pageResearchNotes,
    name: "Research notes",
    markdown: `# Research notes

## What teams told us

- A blank workspace delays the first useful outcome.
- Product screenshots are hard to understand without interaction.
- Teams want confidence that self-hosting is a first-class path.

## Implications

Show a realistic connected workspace, let visitors change a few safe things, and make the boundary between temporary exploration and a real account explicit.`,
  },
  {
    id: DEMO_IDS.pageDecisionLog,
    name: "Decision log",
    markdown: `# Decision log

## 2026-08-31 — Use an isolated guest demo

**Decision:** Host the interactive workspace on a separate demo origin with no reusable credentials.

**Why:** It protects signed-in sessions, keeps temporary edits local, and lets the landing page fail independently.

## 2026-08-28 — Preserve the outcome-led hero

**Decision:** Replace only the screenshot surface. Keep the headline, primary cloud action, self-host action, and trust copy.`,
  },
] as const;

const TASKS = [
  {
    dueDate: "2026-09-03",
    id: "demo-task-finalize-story",
    pageId: DEMO_IDS.taskPageFinalizeStory,
    priority: "High",
    status: "In progress",
    title: "Finalize launch story",
    markdown: "# Finalize launch story\n\nAlign the homepage narrative with the launch brief and confirm the proof points shown in the demo.",
  },
  {
    dueDate: "2026-09-05",
    id: "demo-task-qa-mobile",
    pageId: DEMO_IDS.taskPageQaMobile,
    priority: "High",
    status: "Not started",
    title: "QA mobile demo handoff",
    markdown: "# QA mobile demo handoff\n\nVerify the landing card opens the full-screen demo and that no iframe is loaded at the mobile breakpoint.",
  },
  {
    dueDate: "2026-09-07",
    id: "demo-task-publish-guide",
    pageId: DEMO_IDS.taskPagePublishGuide,
    priority: "Medium",
    status: "Not started",
    title: "Publish self-host guide",
    markdown: "# Publish self-host guide\n\nReview installation steps, deployment prerequisites, and links from the landing-page secondary action.",
  },
  {
    dueDate: "2026-08-30",
    id: "demo-task-seed-workspace",
    pageId: DEMO_IDS.taskPageSeedWorkspace,
    priority: "Medium",
    status: "Done",
    title: "Seed connected launch workspace",
    markdown: "# Seed connected launch workspace\n\nCreate the welcome page, supporting notes, tracker views, task rows, and a pinned AI summary using fictional data only.",
  },
] as const;

const PROPERTY_IDS = {
  dueDate: "demo-property-due-date",
  owner: "demo-property-owner",
  priority: "demo-property-priority",
  status: "demo-property-status",
} as const;

const VIEW_IDS = {
  board: "demo-view-launch-board",
  table: "demo-view-launch-table",
  timeline: "demo-view-launch-timeline",
} as const;

const STATUS_OPTIONS = [
  { color: "gray", group: "To-do", id: "not-started", name: "Not started" },
  { color: "blue", group: "In progress", id: "in-progress", name: "In progress" },
  { color: "green", group: "Complete", id: "done", name: "Done" },
];

const PRIORITY_OPTIONS = [
  { color: "red", id: "priority-high", name: "High" },
  { color: "yellow", id: "priority-medium", name: "Medium" },
  { color: "gray", id: "priority-low", name: "Low" },
];

export function getHostedDemoSeedDefinition() {
  return {
    citationUrls: [
      `/p/${DEMO_IDS.pageLaunchBrief}`,
      `/d/${DEMO_IDS.database}`,
    ],
    email: "explorer@demo.zilobase.invalid",
    pageIds: PAGE_DEFINITIONS.map((record) => record.id),
    propertyTypes: ["status", "date", "person", "select"],
    seedVersion: DEMO_SEED_VERSION,
    taskDatabaseIds: [DEMO_IDS.database],
    taskPageIds: TASKS.map((record) => record.pageId),
    viewIds: Object.values(VIEW_IDS),
  };
}

export async function seedHostedDemo(databaseClient: Database) {
  await databaseClient.transaction(async (transaction) => {
    await transaction
      .insert(user)
      .values({
        createdAt: FIXED_DATE,
        email: "explorer@demo.zilobase.invalid",
        emailVerified: true,
        id: DEMO_IDS.user,
        image: null,
        name: "Alex Explorer",
        updatedAt: FIXED_DATE,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: {
          email: "explorer@demo.zilobase.invalid",
          emailVerified: true,
          image: null,
          name: "Alex Explorer",
          updatedAt: FIXED_DATE,
        },
      });

    await transaction
      .insert(workspace)
      .values({
        createdAt: FIXED_DATE,
        guestInviteMode: "owners_only",
        id: DEMO_IDS.workspace,
        logo: null,
        metadata: JSON.stringify({ demoSeedVersion: DEMO_SEED_VERSION }),
        name: "Launch workspace",
        slug: "hosted-demo-launch",
        teamspaceCreationPolicy: "workspace_owners",
        updatedAt: FIXED_DATE,
      })
      .onConflictDoUpdate({
        target: workspace.id,
        set: {
          guestInviteMode: "owners_only",
          logo: null,
          metadata: JSON.stringify({ demoSeedVersion: DEMO_SEED_VERSION }),
          name: "Launch workspace",
          slug: "hosted-demo-launch",
          teamspaceCreationPolicy: "workspace_owners",
          updatedAt: FIXED_DATE,
        },
      });

    await transaction
      .insert(member)
      .values({
        createdAt: FIXED_DATE,
        id: "demo-member-explorer",
        organizationId: DEMO_IDS.workspace,
        role: "owner",
        userId: DEMO_IDS.user,
      })
      .onConflictDoUpdate({
        target: [member.organizationId, member.userId],
        set: { accessExpiresAt: null, role: "owner" },
      });

    const sidebarConfig = buildDemoSidebarConfig();
    await transaction
      .insert(pageSettings)
      .values({
        createdAt: FIXED_DATE,
        embeddedItemsOpenAs: "sidepanel",
        id: "demo-page-settings",
        pageFullWidth: false,
        sidebarConfig,
        updatedAt: FIXED_DATE,
        userId: DEMO_IDS.user,
      })
      .onConflictDoUpdate({
        target: pageSettings.userId,
        set: {
          embeddedItemsOpenAs: "sidepanel",
          pageFullWidth: false,
          sidebarConfig,
          updatedAt: FIXED_DATE,
        },
      });

    await transaction
      .insert(teamspace)
      .values({
        accessMode: "open",
        createdAt: FIXED_DATE,
        createdById: DEMO_IDS.user,
        description: "Plans, research, decisions, and launch delivery.",
        exportEnabled: false,
        guestsEnabled: false,
        icon: { emoji: "🚀" },
        id: DEMO_IDS.teamspace,
        inviteLinkEnabled: false,
        invitePolicy: "owners",
        isDefault: true,
        memberAccessLevel: "full",
        name: "Launch",
        publicSharingEnabled: false,
        sidebarEditPolicy: "owners",
        updatedAt: FIXED_DATE,
        workspaceId: DEMO_IDS.workspace,
      })
      .onConflictDoUpdate({
        target: teamspace.id,
        set: {
          accessMode: "open",
          description: "Plans, research, decisions, and launch delivery.",
          exportEnabled: false,
          guestsEnabled: false,
          icon: { emoji: "🚀" },
          inviteLinkEnabled: false,
          invitePolicy: "owners",
          isDefault: true,
          memberAccessLevel: "full",
          name: "Launch",
          publicSharingEnabled: false,
          sidebarEditPolicy: "owners",
          updatedAt: FIXED_DATE,
        },
      });

    await transaction
      .insert(teamspacePrincipal)
      .values({
        addedById: DEMO_IDS.user,
        createdAt: FIXED_DATE,
        id: "demo-teamspace-principal-explorer",
        membershipSource: "creator",
        principalId: DEMO_IDS.user,
        principalType: "user",
        role: "owner",
        teamspaceId: DEMO_IDS.teamspace,
        updatedAt: FIXED_DATE,
      })
      .onConflictDoUpdate({
        target: [
          teamspacePrincipal.teamspaceId,
          teamspacePrincipal.principalType,
          teamspacePrincipal.principalId,
        ],
        set: {
          accessLevelOverride: null,
          membershipSource: "creator",
          role: "owner",
          updatedAt: FIXED_DATE,
        },
      });

    const pages = [
      ...PAGE_DEFINITIONS,
      ...TASKS.map((task) => ({
        id: task.pageId,
        markdown: task.markdown,
        name: task.title,
      })),
    ];
    await transaction
      .delete(pageCollaborationDocument)
      .where(inArray(pageCollaborationDocument.pageId, pages.map(({ id }) => id)));

    for (const definition of pages) {
      const content = markdownToPageContent(definition.markdown);
      await transaction
        .insert(page)
        .values({
          content,
          createdAt: FIXED_DATE,
          createdById: DEMO_IDS.user,
          deletedAt: null,
          hasContent: hasPageBodyContent(content),
          id: definition.id,
          metadata: null,
          name: definition.name,
          teamspaceId: DEMO_IDS.teamspace,
          type: "pageblock",
          updatedAt: FIXED_DATE,
          url: "#",
          workspaceId: DEMO_IDS.workspace,
        })
        .onConflictDoUpdate({
          target: page.id,
          set: {
            content,
            deletedAt: null,
            hasContent: hasPageBodyContent(content),
            metadata: null,
            name: definition.name,
            teamspaceId: DEMO_IDS.teamspace,
            updatedAt: FIXED_DATE,
          },
        });
    }

    for (const [position, childId] of [
      DEMO_IDS.pageLaunchBrief,
      DEMO_IDS.pageResearchNotes,
      DEMO_IDS.pageDecisionLog,
    ].entries()) {
      await transaction
        .insert(pageItemPlacement)
        .values({
          createdAt: FIXED_DATE,
          deletedAt: null,
          id: `demo-placement-start-${position + 1}`,
          itemId: childId,
          itemKind: "page",
          parentId: DEMO_IDS.pageStart,
          parentKind: "page",
          placementKind: "primary",
          position,
          updatedAt: FIXED_DATE,
          workspaceId: DEMO_IDS.workspace,
        })
        .onConflictDoUpdate({
          target: pageItemPlacement.id,
          set: { deletedAt: null, position, updatedAt: FIXED_DATE },
        });
    }

    const databaseConfig = {
      description: "Coordinate the public launch across product, content, and operations.",
      emoji: "📅",
      nameColumn: { label: "Task", showPageIcon: true },
      setupDismissed: true,
    };
    await transaction
      .insert(database)
      .values({
        config: databaseConfig,
        createdAt: FIXED_DATE,
        createdById: DEMO_IDS.user,
        deletedAt: null,
        id: DEMO_IDS.database,
        name: "Launch tracker",
        pageId: null,
        teamspaceId: DEMO_IDS.teamspace,
        updatedAt: FIXED_DATE,
        version: 1,
        workspaceId: DEMO_IDS.workspace,
      })
      .onConflictDoUpdate({
        target: database.id,
        set: {
          config: databaseConfig,
          deletedAt: null,
          name: "Launch tracker",
          teamspaceId: DEMO_IDS.teamspace,
          updatedAt: FIXED_DATE,
          version: 1,
        },
      });
    await transaction
      .insert(dataSource)
      .values({
        config: databaseConfig,
        configVersion: 1,
        createdAt: FIXED_DATE,
        createdById: DEMO_IDS.user,
        deletedAt: null,
        id: DEMO_IDS.dataSource,
        name: "Launch tracker",
        parentDatabaseId: DEMO_IDS.database,
        updatedAt: FIXED_DATE,
        version: 1,
        workspaceId: DEMO_IDS.workspace,
      })
      .onConflictDoUpdate({
        target: dataSource.id,
        set: {
          config: databaseConfig,
          deletedAt: null,
          name: "Launch tracker",
          updatedAt: FIXED_DATE,
          version: 1,
        },
      });
    await transaction
      .insert(databaseDataSource)
      .values({
        createdAt: FIXED_DATE,
        databaseId: DEMO_IDS.database,
        dataSourceId: DEMO_IDS.dataSource,
        linkedById: DEMO_IDS.user,
        position: 0,
        updatedAt: FIXED_DATE,
      })
      .onConflictDoUpdate({
        target: [databaseDataSource.databaseId, databaseDataSource.dataSourceId],
        set: { linkedById: DEMO_IDS.user, position: 0, updatedAt: FIXED_DATE },
      });

    const propertyDefinitions = [
      {
        config: { defaultOptionId: "not-started", options: STATUS_OPTIONS },
        id: PROPERTY_IDS.status,
        name: "Status",
        type: "status",
      },
      { config: null, id: PROPERTY_IDS.dueDate, name: "Due date", type: "date" },
      {
        config: { personDefault: "no_default", personLimit: "one_person" },
        id: PROPERTY_IDS.owner,
        name: "Owner",
        type: "person",
      },
      {
        config: { options: PRIORITY_OPTIONS },
        id: PROPERTY_IDS.priority,
        name: "Priority",
        type: "select",
      },
    ];
    for (const [position, property] of propertyDefinitions.entries()) {
      await transaction
        .insert(pageProperty)
        .values({
          config: property.config,
          createdAt: FIXED_DATE,
          deletedAt: null,
          id: property.id,
          name: property.name,
          type: property.type,
          updatedAt: FIXED_DATE,
          workspaceId: DEMO_IDS.workspace,
        })
        .onConflictDoUpdate({
          target: pageProperty.id,
          set: {
            config: property.config,
            deletedAt: null,
            name: property.name,
            type: property.type,
            updatedAt: FIXED_DATE,
          },
        });
      await transaction
        .insert(databaseProperty)
        .values({
          createdAt: FIXED_DATE,
          dataSourceId: DEMO_IDS.dataSource,
          id: `demo-database-property-${position + 1}`,
          position,
          propertyId: property.id,
          updatedAt: FIXED_DATE,
          visible: true,
        })
        .onConflictDoUpdate({
          target: databaseProperty.id,
          set: { position, updatedAt: FIXED_DATE, visible: true },
        });
    }

    const viewDefinitions = [
      { config: {}, id: VIEW_IDS.table, name: "Table", position: 0, type: "table" },
      {
        config: { groupPropertyId: PROPERTY_IDS.status },
        id: VIEW_IDS.board,
        name: "Board",
        position: 1,
        type: "kanban",
      },
      {
        config: { datePropertyId: PROPERTY_IDS.dueDate },
        id: VIEW_IDS.timeline,
        name: "Timeline",
        position: 2,
        type: "timeline",
      },
    ];
    for (const view of viewDefinitions) {
      await transaction
        .insert(databaseView)
        .values({
          ...view,
          createdAt: FIXED_DATE,
          databaseId: DEMO_IDS.database,
          dataSourceId: DEMO_IDS.dataSource,
          updatedAt: FIXED_DATE,
        })
        .onConflictDoUpdate({
          target: databaseView.id,
          set: {
            config: view.config,
            name: view.name,
            position: view.position,
            type: view.type,
            updatedAt: FIXED_DATE,
          },
        });
    }

    for (const [position, task] of TASKS.entries()) {
      await transaction
        .insert(databaseRow)
        .values({
          createdAt: FIXED_DATE,
          createdById: DEMO_IDS.user,
          dataSourceId: DEMO_IDS.dataSource,
          deletedAt: null,
          id: task.id,
          lastEditedById: DEMO_IDS.user,
          pageId: task.pageId,
          position,
          updatedAt: FIXED_DATE,
        })
        .onConflictDoUpdate({
          target: databaseRow.id,
          set: {
            deletedAt: null,
            lastEditedById: DEMO_IDS.user,
            position,
            updatedAt: FIXED_DATE,
          },
        });
      await transaction
        .insert(pageItemPlacement)
        .values({
          createdAt: FIXED_DATE,
          deletedAt: null,
          id: `demo-placement-task-${position + 1}`,
          itemId: task.pageId,
          itemKind: "page",
          parentId: DEMO_IDS.database,
          parentKind: "database",
          placementKind: "database_row",
          position,
          sourceRowId: task.id,
          updatedAt: FIXED_DATE,
          workspaceId: DEMO_IDS.workspace,
        })
        .onConflictDoUpdate({
          target: pageItemPlacement.id,
          set: { deletedAt: null, position, updatedAt: FIXED_DATE },
        });

      const values = [
        [PROPERTY_IDS.status, task.status],
        [PROPERTY_IDS.dueDate, task.dueDate],
        [PROPERTY_IDS.owner, [DEMO_IDS.user]],
        [PROPERTY_IDS.priority, task.priority],
      ] as const;
      for (const [propertyId, value] of values) {
        await transaction
          .insert(pagePropertyValue)
          .values({
            createdAt: FIXED_DATE,
            id: `demo-value-${task.id}-${propertyId}`,
            pageId: task.pageId,
            propertyId,
            updatedAt: FIXED_DATE,
            value,
          })
          .onConflictDoUpdate({
            target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
            set: { updatedAt: FIXED_DATE, value },
          });
      }
    }

    await transaction
      .insert(aiChatThread)
      .values({
        archivedAt: null,
        createdAt: FIXED_DATE,
        deletedAt: null,
        id: DEMO_IDS.aiThread,
        lastActivityAt: FIXED_DATE,
        nextMessageSequence: 2,
        pinnedAt: FIXED_DATE,
        title: "Launch tracker review",
        updatedAt: FIXED_DATE,
        userId: DEMO_IDS.user,
        workspaceId: DEMO_IDS.workspace,
      })
      .onConflictDoUpdate({
        target: aiChatThread.id,
        set: {
          archivedAt: null,
          deletedAt: null,
          lastActivityAt: FIXED_DATE,
          nextMessageSequence: 2,
          pinnedAt: FIXED_DATE,
          title: "Launch tracker review",
          updatedAt: FIXED_DATE,
        },
      });
    const aiMessages = [
      {
        id: DEMO_IDS.aiUserMessage,
        parts: [{ text: "Summarize launch readiness and call out the next decision.", type: "text" }],
        role: "user",
        sequence: 0,
      },
      {
        id: DEMO_IDS.aiAssistantMessage,
        parts: [
          {
            input: {
              databaseId: DEMO_IDS.database,
              limit: 25,
            },
            output: {
              citations: [
                {
                  id: DEMO_IDS.pageLaunchBrief,
                  source: "page",
                  title: "Launch brief",
                  url: `/p/${DEMO_IDS.pageLaunchBrief}`,
                },
                {
                  id: DEMO_IDS.database,
                  source: "database",
                  title: "Launch tracker",
                  url: `/d/${DEMO_IDS.database}`,
                },
              ],
              data: { rowCount: TASKS.length },
              ok: true,
              status: "succeeded",
              summary: "Reviewed four launch tasks.",
            },
            state: "output-available",
            toolCallId: "demo-tool-launch-tracker-review",
            type: "tool-queryWorkspaceDatabase",
          },
          {
            text: `The launch workspace is in good shape: the connected tracker has four tasks across product, mobile QA, documentation, and workspace setup. One item is complete, one is in progress, and two are queued.\n\nThe next decision is whether mobile QA can finish before the self-host guide review. See the [Launch brief](/p/${DEMO_IDS.pageLaunchBrief}) and [Launch tracker](/d/${DEMO_IDS.database}) for source context.`,
            type: "text",
          },
        ],
        role: "assistant",
        sequence: 1,
      },
    ];
    for (const message of aiMessages) {
      await transaction
        .insert(aiChatMessage)
        .values({
          ...message,
          clientId: null,
          createdAt: FIXED_DATE,
          status: "completed",
          threadId: DEMO_IDS.aiThread,
          turnId: null,
          updatedAt: FIXED_DATE,
        })
        .onConflictDoUpdate({
          target: aiChatMessage.id,
          set: {
            parts: message.parts,
            role: message.role,
            sequence: message.sequence,
            status: "completed",
            updatedAt: FIXED_DATE,
          },
        });
    }
  });

  await assertHostedDemoSeed(databaseClient);
}

export async function assertHostedDemoSeed(databaseClient: Database) {
  const [demoUser, demoWorkspace, seededPages, seededViews, seededDocuments, credentials, keys, providers] =
    await Promise.all([
      databaseClient.select().from(user).where(eq(user.id, DEMO_IDS.user)).limit(1),
      databaseClient.select().from(workspace).where(eq(workspace.id, DEMO_IDS.workspace)).limit(1),
      databaseClient
        .select({ content: page.content, id: page.id })
        .from(page)
        .where(inArray(page.id, [
          ...PAGE_DEFINITIONS.map((record) => record.id),
          ...TASKS.map((record) => record.pageId),
        ])),
      databaseClient
        .select({ id: databaseView.id })
        .from(databaseView)
        .where(inArray(databaseView.id, Object.values(VIEW_IDS))),
      databaseClient
        .select({ pageId: pageCollaborationDocument.pageId })
        .from(pageCollaborationDocument)
        .where(inArray(pageCollaborationDocument.pageId, [
          ...PAGE_DEFINITIONS.map((record) => record.id),
          ...TASKS.map((record) => record.pageId),
        ])),
      databaseClient.select({ id: account.id }).from(account).where(eq(account.userId, DEMO_IDS.user)),
      databaseClient.select({ id: apikey.id }).from(apikey).where(eq(apikey.referenceId, DEMO_IDS.user)),
      databaseClient
        .select({ id: workspaceAiProviderConfig.id })
        .from(workspaceAiProviderConfig)
        .where(eq(workspaceAiProviderConfig.workspaceId, DEMO_IDS.workspace)),
    ]);

  if (!demoUser[0] || !demoUser[0].email.endsWith(".invalid")) {
    throw new Error("Hosted demo seed must use a fictional .invalid identity.");
  }
  if (!demoWorkspace[0]) throw new Error("Hosted demo workspace is missing.");
  if (seededPages.length !== PAGE_DEFINITIONS.length + TASKS.length) {
    throw new Error("Hosted demo pages are incomplete.");
  }
  if (!seededPages.every((record) => hasPageBodyContent(record.content))) {
    throw new Error("Hosted demo page bodies are incomplete.");
  }
  if (seededDocuments.length > 0) {
    throw new Error("Hosted demo pages must not use collaboration documents.");
  }
  if (seededViews.length !== Object.keys(VIEW_IDS).length) {
    throw new Error("Hosted demo database views are incomplete.");
  }
  if (credentials.length || keys.length || providers.length) {
    throw new Error("Hosted demo seed must not contain credentials or provider configuration.");
  }

  const [membership] = await databaseClient
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(and(eq(member.userId, DEMO_IDS.user), eq(member.organizationId, DEMO_IDS.workspace)))
    .limit(1);
  if (!membership || membership.role !== "owner") {
    throw new Error("Hosted demo membership is incomplete.");
  }

  const [settings, taskProperties, assistantMessage] = await Promise.all([
    databaseClient
      .select({ sidebarConfig: pageSettings.sidebarConfig })
      .from(pageSettings)
      .where(eq(pageSettings.userId, DEMO_IDS.user))
      .limit(1),
    databaseClient
      .select({ id: pageProperty.id, type: pageProperty.type })
      .from(pageProperty)
      .where(inArray(pageProperty.id, Object.values(PROPERTY_IDS))),
    databaseClient
      .select({ parts: aiChatMessage.parts })
      .from(aiChatMessage)
      .where(eq(aiChatMessage.id, DEMO_IDS.aiAssistantMessage))
      .limit(1),
  ]);
  const sidebarJson = JSON.stringify(settings[0]?.sidebarConfig ?? null);
  if (!sidebarJson.includes(DEMO_IDS.database)) {
    throw new Error("Hosted demo task navigation is incomplete.");
  }
  if (
    taskProperties.length !== Object.keys(PROPERTY_IDS).length ||
    !["status", "date", "person", "select"].every((type) =>
      taskProperties.some((property) => property.type === type)
    )
  ) {
    throw new Error("Hosted demo task schema is incomplete.");
  }
  const assistantParts = JSON.stringify(assistantMessage[0]?.parts ?? null);
  if (
    !assistantParts.includes(`/p/${DEMO_IDS.pageLaunchBrief}`) ||
    !assistantParts.includes(`/d/${DEMO_IDS.database}`)
  ) {
    throw new Error("Hosted demo AI citations are incomplete.");
  }
}

function buildDemoSidebarConfig() {
  const home = {
    icon: "home",
    id: "home",
    name: "Home",
    sections: [
      { id: "demo-recents", kind: "recents", limit: 10, sort: "lastEdited" },
      { id: "demo-teamspaces", kind: "teamspaces", limit: 10, sort: "lastEdited" },
    ],
    shortcuts: [
      { id: "demo-ai", target: { route: "ai", type: "route" } },
      { id: "demo-tasks", target: { route: "tasks", type: "route" } },
      { id: "demo-library", target: { type: "library", view: "recents" } },
      { id: "demo-trash", target: { route: "trash", type: "route" } },
    ],
  };
  const layout = { tabs: [home], taskDatabaseIds: [DEMO_IDS.database] };
  return {
    defaultLayout: layout,
    libraryView: "recents",
    version: 3,
    workspaceLayouts: { [DEMO_IDS.workspace]: layout },
  };
}
