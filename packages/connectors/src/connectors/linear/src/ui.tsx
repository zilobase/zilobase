"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import {
  ChevronIcon,
  ConnectorStat,
  SourceTitle,
} from "../../../shared/connector-ui.js";
import {
  collapseRegionStyle,
  connectorUiStyles,
} from "../../../shared/connector-ui-styles.js";
import { formatConnectorMediumDate } from "../../../shared/format.js";

const linearIconSrc = "/icons/linear.svg";

export type LinearToolName =
  | "getLinearIssue"
  | "getLinearIssueComments"
  | "getLinearProfile"
  | "listLinearIssues"
  | "listLinearProjects"
  | "listLinearTeams"
  | "searchLinearIssues";

type LinearUserSummary = {
  displayName?: string;
  email?: string;
  id: string;
  name?: string;
};

type LinearWorkflowStateSummary = {
  id: string;
  name: string;
  type: string;
};

type LinearTeamSummary = {
  description?: string;
  displayName: string;
  id: string;
  issueCount: number;
  key: string;
  name: string;
  private: boolean;
};

type LinearIssueSummary = {
  assignee?: LinearUserSummary;
  completedAt?: string;
  createdAt: string;
  description?: string;
  dueDate?: string;
  estimate?: number | null;
  id: string;
  identifier: string;
  priority?: number;
  priorityLabel?: string;
  state?: LinearWorkflowStateSummary;
  team?: LinearTeamSummary;
  title: string;
  updatedAt: string;
  url: string;
};

type LinearProjectSummary = {
  completedAt?: string;
  content?: string;
  createdAt: string;
  description?: string;
  health?: string | null;
  id: string;
  name: string;
  priorityLabel?: string;
  progress: number;
  slugId: string;
  startDate?: string | null;
  state?: string;
  targetDate?: string | null;
  updatedAt: string;
  url: string;
};

type LinearProfileOutput = {
  workspace?: {
    id: string;
    name?: string;
    urlKey?: string;
  };
  viewer?: LinearUserSummary;
};

type LinearIssuesOutput = {
  hasNextPage?: boolean;
  issues?: LinearIssueSummary[];
  nextCursor?: string;
  totalCount?: number;
};

type LinearProjectsOutput = {
  hasNextPage?: boolean;
  nextCursor?: string;
  projects?: LinearProjectSummary[];
};

type LinearTeamsOutput = {
  hasNextPage?: boolean;
  nextCursor?: string;
  teams?: LinearTeamSummary[];
};

type LinearCommentsOutput = {
  comments?: Array<{
    body?: string;
    createdAt?: string;
    id: string;
    updatedAt?: string;
    url?: string;
    user?: LinearUserSummary;
  }>;
  hasNextPage?: boolean;
  issue?: Pick<LinearIssueSummary, "id" | "identifier" | "title" | "url">;
  nextCursor?: string;
};

export type LinearToolOutputProps = {
  className?: string;
  output: unknown;
  toolName: LinearToolName;
};

const rowSeparator =
  "1px solid color-mix(in srgb, currentColor 10%, transparent)";

const styles: Record<string, CSSProperties> = {
  panel: {
    display: "grid",
    gap: 10,
    maxWidth: "100%",
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
  },
  headerActions: connectorUiStyles.headerActions,
  toggleButton: connectorUiStyles.toggleButton,
  collapseInner: connectorUiStyles.collapseInner,
  summary: {
    color: "color-mix(in srgb, currentColor 60%, transparent)",
    fontSize: 11,
    lineHeight: 1.35,
    marginTop: 2,
  },
  list: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    boxSizing: "border-box",
    maxHeight: 420,
    overflowX: "hidden",
    overflowY: "auto",
    width: "100%",
  },
  row: {
    alignItems: "flex-start",
    background: "transparent",
    border: 0,
    borderTop: rowSeparator,
    boxSizing: "border-box",
    color: "inherit",
    display: "flex",
    gap: 10,
    padding: "11px 12px",
    textAlign: "left",
    textDecoration: "none",
    width: "100%",
  },
  mark: {
    alignItems: "center",
    background: "color-mix(in srgb, currentColor 8%, transparent)",
    borderRadius: 6,
    display: "flex",
    flex: "0 0 auto",
    fontSize: 11,
    fontWeight: 700,
    height: 32,
    justifyContent: "center",
    marginTop: 1,
    width: 32,
  },
  rowMain: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
  },
  rowTopline: {
    alignItems: "center",
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 3,
    minWidth: 0,
  },
  id: {
    color: "color-mix(in srgb, currentColor 56%, transparent)",
    flex: "0 0 auto",
    fontSize: 11,
    fontWeight: 650,
    lineHeight: 1.25,
  },
  rowMeta: {
    color: "color-mix(in srgb, currentColor 56%, transparent)",
    flex: "0 0 auto",
    fontSize: 11,
    lineHeight: 1.25,
  },
  itemTitle: {
    color: "color-mix(in srgb, currentColor 90%, transparent)",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.35,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: "color-mix(in srgb, currentColor 62%, transparent)",
    fontSize: 12,
    lineHeight: 1.4,
    margin: "3px 0 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  metaLine: {
    color: "color-mix(in srgb, currentColor 58%, transparent)",
    display: "flex",
    flexWrap: "wrap",
    fontSize: 11,
    gap: "6px 10px",
    lineHeight: 1.35,
    marginTop: 7,
  },
  pill: connectorUiStyles.pill,
  card: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 8,
    display: "grid",
    gap: 10,
    padding: 12,
  },
  statGrid: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  },
};

export function LinearToolOutput({
  className,
  output,
  toolName,
}: LinearToolOutputProps) {
  if (toolName === "searchLinearIssues" || toolName === "listLinearIssues") {
    return (
      <LinearIssues
        className={className}
        output={output as LinearIssuesOutput}
        title={toolName === "searchLinearIssues" ? "Matching issues" : "Recent issues"}
      />
    );
  }

  if (toolName === "getLinearIssue") {
    return <LinearIssueDetail className={className} issue={output as LinearIssueSummary} />;
  }

  if (toolName === "getLinearIssueComments") {
    return (
      <LinearComments
        className={className}
        output={output as LinearCommentsOutput}
      />
    );
  }

  if (toolName === "listLinearProjects") {
    return (
      <LinearProjects className={className} output={output as LinearProjectsOutput} />
    );
  }

  if (toolName === "listLinearTeams") {
    return <LinearTeams className={className} output={output as LinearTeamsOutput} />;
  }

  if (toolName === "getLinearProfile") {
    return <LinearProfile className={className} output={output as LinearProfileOutput} />;
  }

  return null;
}

export function isLinearToolName(toolName: string): toolName is LinearToolName {
  return (
    toolName === "getLinearIssue" ||
    toolName === "getLinearIssueComments" ||
    toolName === "getLinearProfile" ||
    toolName === "listLinearIssues" ||
    toolName === "listLinearProjects" ||
    toolName === "listLinearTeams" ||
    toolName === "searchLinearIssues"
  );
}

function LinearIssues({
  className,
  output,
  title,
}: {
  className?: string;
  output: LinearIssuesOutput;
  title: string;
}) {
  const issues = output.issues ?? [];
  const count = output.totalCount ?? issues.length;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className={className} style={styles.panel}>
      <ToolHeader
        countLabel={`${count} ${count === 1 ? "issue" : "issues"}`}
        isExpanded={isExpanded}
        kicker="Linear issues"
        onExpandedChange={setIsExpanded}
        summary={
          issues.length
            ? `${issues.length} issues shown from Linear`
            : "No issues returned from Linear"
        }
        title={title}
      />
      <div style={collapseRegionStyle(isExpanded)}>
        <div style={styles.collapseInner}>
          <div style={styles.list}>
            {issues.length ? (
              issues.map((issue, index) => (
                <IssueRow index={index} issue={issue} key={issue.id} />
              ))
            ) : (
              <Empty label="No issues found" />
            )}
          </div>
          {output.hasNextPage ? (
            <div style={styles.summary}>More issues are available.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function IssueRow({ index, issue }: { index: number; issue: LinearIssueSummary }) {
  return (
    <a
      href={issue.url}
      rel="noopener noreferrer"
      style={{ ...styles.row, borderTop: index === 0 ? 0 : rowSeparator }}
      target="_blank"
    >
      <div style={styles.mark}>{issue.team?.key ?? issue.identifier.split("-")[0]}</div>
      <div style={styles.rowMain}>
        <div style={styles.rowTopline}>
          <span style={styles.id}>{issue.identifier}</span>
          <span style={styles.rowMeta}>{formatConnectorMediumDate(issue.updatedAt)}</span>
        </div>
        <p style={styles.itemTitle}>{issue.title}</p>
        {issue.description ? (
          <p style={styles.description}>{stripMarkdown(issue.description)}</p>
        ) : null}
        <div style={styles.metaLine}>
          {metaItem(issue.state?.name)}
          {metaItem(issue.priorityLabel)}
          {metaItem(issue.assignee ? userLabel(issue.assignee) : "Unassigned")}
          {metaItem(issue.dueDate ? `Due ${formatShortDate(issue.dueDate)}` : undefined)}
        </div>
      </div>
    </a>
  );
}

function LinearIssueDetail({
  className,
  issue,
}: {
  className?: string;
  issue: LinearIssueSummary;
}) {
  return (
    <section className={className} style={styles.card}>
      <ToolHeader
        countLabel={issue.state?.name ?? "Issue"}
        kicker={issue.identifier}
        summary={issue.team ? `${issue.team.name} · Updated ${formatConnectorMediumDate(issue.updatedAt)}` : `Updated ${formatConnectorMediumDate(issue.updatedAt)}`}
        title={issue.title}
      />
      {issue.description ? (
        <p style={{ ...styles.description, whiteSpace: "pre-wrap" }}>
          {stripMarkdown(issue.description)}
        </p>
      ) : null}
      <div style={styles.metaLine}>
        {metaItem(issue.priorityLabel)}
        {metaItem(issue.assignee ? userLabel(issue.assignee) : "Unassigned")}
        {metaItem(issue.dueDate ? `Due ${formatShortDate(issue.dueDate)}` : undefined)}
      </div>
    </section>
  );
}

function LinearComments({
  className,
  output,
}: {
  className?: string;
  output: LinearCommentsOutput;
}) {
  const comments = output.comments ?? [];

  return (
    <section className={className} style={styles.panel}>
      <ToolHeader
        countLabel={`${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
        kicker={output.issue?.identifier ?? "Linear comments"}
        summary={output.issue?.title}
        title="Issue discussion"
      />
      <div style={styles.list}>
        {comments.length ? (
          comments.map((comment, index) => (
            <article
              key={comment.id}
              style={{ ...styles.row, borderTop: index === 0 ? 0 : rowSeparator }}
            >
              <div style={styles.mark}>{initials(userLabel(comment.user))}</div>
              <div style={styles.rowMain}>
                <div style={styles.rowTopline}>
                  <span style={styles.id}>{userLabel(comment.user)}</span>
                  <span style={styles.rowMeta}>{formatConnectorMediumDate(comment.createdAt)}</span>
                </div>
                <p style={{ ...styles.description, whiteSpace: "pre-wrap" }}>
                  {stripMarkdown(comment.body)}
                </p>
              </div>
            </article>
          ))
        ) : (
          <Empty label="No comments found" />
        )}
      </div>
    </section>
  );
}

function LinearProjects({
  className,
  output,
}: {
  className?: string;
  output: LinearProjectsOutput;
}) {
  const projects = output.projects ?? [];

  return (
    <section className={className} style={styles.panel}>
      <ToolHeader
        countLabel={`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
        kicker="Linear projects"
        summary={projects.length ? "Visible projects from Linear" : "No projects returned from Linear"}
        title="Projects"
      />
      <div style={styles.list}>
        {projects.length ? (
          projects.map((project, index) => {
            const progressPercent =
              project.progress <= 1 ? project.progress * 100 : project.progress;

            return (
              <a
                href={project.url}
                key={project.id}
                rel="noopener noreferrer"
                style={{ ...styles.row, borderTop: index === 0 ? 0 : rowSeparator }}
                target="_blank"
              >
                <div style={styles.mark}>{project.slugId.slice(0, 2).toUpperCase()}</div>
                <div style={styles.rowMain}>
                  <div style={styles.rowTopline}>
                    <span style={styles.id}>{project.slugId}</span>
                    <span style={styles.rowMeta}>{Math.round(progressPercent)}%</span>
                  </div>
                  <p style={styles.itemTitle}>{project.name}</p>
                  {project.description ? (
                    <p style={styles.description}>{stripMarkdown(project.description)}</p>
                  ) : null}
                  <div style={styles.metaLine}>
                    {metaItem(project.state)}
                    {metaItem(project.health ?? undefined)}
                    {metaItem(project.targetDate ? `Target ${formatShortDate(project.targetDate)}` : undefined)}
                  </div>
                </div>
              </a>
            );
          })
        ) : (
          <Empty label="No projects found" />
        )}
      </div>
    </section>
  );
}

function LinearTeams({
  className,
  output,
}: {
  className?: string;
  output: LinearTeamsOutput;
}) {
  const teams = output.teams ?? [];

  return (
    <section className={className} style={styles.panel}>
      <ToolHeader
        countLabel={`${teams.length} ${teams.length === 1 ? "team" : "teams"}`}
        kicker="Linear teams"
        summary={teams.length ? "Visible teams from Linear" : "No teams returned from Linear"}
        title="Teams"
      />
      <div style={styles.list}>
        {teams.length ? (
          teams.map((team, index) => (
            <article
              key={team.id}
              style={{ ...styles.row, borderTop: index === 0 ? 0 : rowSeparator }}
            >
              <div style={styles.mark}>{team.key}</div>
              <div style={styles.rowMain}>
                <div style={styles.rowTopline}>
                  <span style={styles.id}>{team.key}</span>
                  <span style={styles.rowMeta}>{team.issueCount} issues</span>
                </div>
                <p style={styles.itemTitle}>{team.displayName || team.name}</p>
                {team.description ? (
                  <p style={styles.description}>{stripMarkdown(team.description)}</p>
                ) : null}
                <div style={styles.metaLine}>
                  {metaItem(team.private ? "Private" : "Public")}
                </div>
              </div>
            </article>
          ))
        ) : (
          <Empty label="No teams found" />
        )}
      </div>
    </section>
  );
}

function LinearProfile({
  className,
  output,
}: {
  className?: string;
  output: LinearProfileOutput;
}) {
  return (
    <section className={className} style={styles.card}>
      <ToolHeader
        countLabel="Connected"
        kicker="Linear profile"
        summary={output.viewer ? userLabel(output.viewer) : undefined}
        title={output.workspace?.name ?? "Linear page"}
      />
      <div style={styles.statGrid}>
        <ConnectorStat label="Page" value={output.workspace?.name ?? "Unavailable"} />
        <ConnectorStat label="URL key" value={output.workspace?.urlKey ?? "Unavailable"} />
        <ConnectorStat label="Viewer" value={output.viewer ? userLabel(output.viewer) : "Unavailable"} />
      </div>
    </section>
  );
}

function ToolHeader({
  countLabel,
  isExpanded,
  kicker,
  onExpandedChange,
  summary,
  title,
}: {
  countLabel?: string;
  isExpanded?: boolean;
  kicker: ReactNode;
  onExpandedChange?: (expanded: boolean) => void;
  summary?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div style={styles.header}>
      <div>
        {kicker === "Linear issues" ? (
          <SourceTitle iconSrc={linearIconSrc} title={title} />
        ) : (
          <>
            <div style={connectorUiStyles.kicker}>{kicker}</div>
            <div style={connectorUiStyles.title}>{title}</div>
          </>
        )}
        {summary ? <div style={styles.summary}>{summary}</div> : null}
      </div>
      {countLabel ? (
        <div style={styles.headerActions}>
          <span style={styles.pill}>{countLabel}</span>
          {onExpandedChange ? (
            <button
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Hide Linear results" : "Show Linear results"}
              onClick={() => onExpandedChange(!isExpanded)}
              style={styles.toggleButton}
              type="button"
            >
              <ChevronIcon expanded={Boolean(isExpanded)} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ ...styles.row, borderTop: 0 }}>{label}</div>;
}

function metaItem(value?: string | null) {
  return value ? <span>{value}</span> : null;
}

function userLabel(user?: LinearUserSummary) {
  return user?.displayName ?? user?.name ?? user?.email ?? "Unknown";
}

function initials(value?: string) {
  return (value ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function stripMarkdown(value?: string) {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>~-]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
