export type AgentProgressStep = {
  detail?: string;
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
};

export type AgentProgressSnapshot = {
  currentPhase:
    | "planning"
    | "container"
    | "schema"
    | "views"
    | "rows"
    | "finalizing";
  rowProgress?: {
    completed: number;
    total: number;
  };
  sequence: number;
  startedAt: string;
  status: "running" | "succeeded" | "failed";
  steps: AgentProgressStep[];
  title: string;
  toolCallId: string;
  toolName: string;
  updatedAt: string;
};
