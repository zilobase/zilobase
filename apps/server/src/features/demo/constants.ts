export const DEMO_HEADER = "x-zilobase-demo";
export const DEMO_HEADER_VALUE = "1";
export const DEMO_SEED_VERSION = 1;

export const DEMO_IDS = {
  aiAssistantMessage: "demo-ai-message-assistant",
  aiThread: "demo-ai-thread-launch-review",
  aiUserMessage: "demo-ai-message-user",
  database: "demo-database-launch-tracker",
  dataSource: "demo-data-source-launch-tracker",
  pageDecisionLog: "demo-page-decision-log",
  pageLaunchBrief: "demo-page-launch-brief",
  pageResearchNotes: "demo-page-research-notes",
  pageStart: "demo-page-start-here",
  taskPageFinalizeStory: "demo-task-page-finalize-story",
  taskPagePublishGuide: "demo-task-page-publish-guide",
  taskPageQaMobile: "demo-task-page-qa-mobile",
  taskPageSeedWorkspace: "demo-task-page-seed-workspace",
  teamspace: "demo-teamspace-launch",
  user: "demo-user-explorer",
  workspace: "demo-workspace-launch",
} as const;

export const DEMO_START_PATH = `/p/${DEMO_IDS.pageStart}`;
