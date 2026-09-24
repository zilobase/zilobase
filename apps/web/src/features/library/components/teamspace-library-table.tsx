import { Fragment, useRef, useState, type CSSProperties } from "react";

import {
  ChevronRight,
  Globe2Icon,
  Layers3Icon,
  LockIcon,
  UsersIcon,
} from "@/shared/components/icons";
import { useResizableTableColumns } from "@/shared/hooks/use-resizable-table-columns";

import { DatabasePageLink } from "@/features/databases";

import { PageIconDisplay } from "@/features/pages/index";

import { type Teamspace, type TeamspaceAccessMode } from "@zilobase/features/teamspaces";

import {
  buildTeamspaceLibraryRows,
  getHomepageRowType,
  type HomepageRow,
} from "../model/library-model";

const teamspaceColumns = [
  { id: "name", label: "Name", width: 280 },
  { id: "description", label: "Description", width: 260 },
  { id: "type", label: "Type", width: 140 },
  { id: "access", label: "Access", width: 170 },
  { id: "members", label: "Members", width: 110 },
] as const;

const teamspaceColumnKeys = teamspaceColumns.map((column) => column.id);

export function TeamspacesLibraryTable({
  onOpenRow,
  rows,
  teamspaces,
}: {
  onOpenRow: (rowId: string) => void;
  rows: HomepageRow[];
  teamspaces: Teamspace[];
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const { columnWidths, startColumnResize, tableMinWidth } = useResizableTableColumns({
    columnKeys: teamspaceColumnKeys,
    getDefaultWidth: (columnKey) =>
      teamspaceColumns.find((column) => column.id === columnKey)?.width ?? 140,
    minWidth: 96,
    tableWrapRef,
  });

  if (teamspaces.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-content-secondary">
        No teamspaces yet. Create one for a team or project.
      </div>
    );
  }

  return (
    <div
      ref={tableWrapRef}
      className="database-table-wrap min-w-[58rem] text-sm leading-5"
      data-vertical-lines="true"
    >
      <table
        className="database-table"
        style={
          {
            "--database-table-min-width": `${tableMinWidth}px`,
          } as CSSProperties
        }
      >
        <colgroup>
          {teamspaceColumns.map((column) => (
            <col
              data-column-id={column.id}
              key={column.id}
              style={{
                width: columnWidths[column.id] ?? column.width,
              }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {teamspaceColumns.map((column) => (
              <th
                className={column.id === "name" ? "database-name-header" : undefined}
                key={column.id}
              >
                <div className="database-name-header-content">{column.label}</div>
                <span
                  aria-hidden="true"
                  className="database-column-resize-handle"
                  onPointerDown={(event) => startColumnResize(column.id, event)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamspaces.map((teamspace) => {
            const expanded = expandedIds.has(teamspace.id);
            const teamspaceRows = buildTeamspaceLibraryRows(rows, teamspace.id);
            return (
              <Fragment key={teamspace.id}>
                <tr className="group hover:bg-action-neutral-hover">
                  <td className="database-page-cell">
                    <button
                      aria-expanded={expanded}
                      className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
                      onClick={() =>
                        setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(teamspace.id)) next.delete(teamspace.id);
                          else next.add(teamspace.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      <ChevronRight
                        className={`size-3.5 shrink-0 text-content-secondary transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                      {typeof teamspace.icon === "string" && teamspace.icon ? (
                        <PageIconDisplay size="sm" value={teamspace.icon} />
                      ) : (
                        <Layers3Icon className="size-4 shrink-0 text-content-secondary" />
                      )}
                      <span className="truncate font-semibold">{teamspace.name}</span>
                    </button>
                  </td>
                  <td className="truncate text-content-secondary">
                    {teamspace.description?.trim() || "—"}
                  </td>
                  <td className="text-content-secondary">Teamspace</td>
                  <td>
                    <span className="flex items-center gap-1.5 capitalize">
                      <TeamspaceAccessIcon accessMode={teamspace.accessMode} />
                      {teamspace.isDefault ? "Default" : teamspace.accessMode}
                    </span>
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5">
                      <UsersIcon className="size-4 text-content-secondary" />
                      {teamspace.memberCount ?? 0}
                    </span>
                  </td>
                </tr>
                {expanded ? (
                  <Fragment>
                    {teamspaceRows.length > 0 ? (
                      teamspaceRows.map(({ depth, row }) => (
                        <tr aria-label={`${teamspace.name} contents`} key={row.id}>
                          <td className="database-page-cell">
                            <div
                              className="database-cell-content"
                              style={{ paddingLeft: `${24 + depth * 16}px` }}
                            >
                              <DatabasePageLink
                                onOpen={onOpenRow}
                                pageId={row.id}
                                pageSummary={{
                                  iconKind: row.iconKind,
                                  id: row.id,
                                  metadata: row.metadata,
                                  name: row.name,
                                }}
                              />
                            </div>
                          </td>
                          <td className="text-content-secondary">—</td>
                          <td className="text-content-secondary">{getHomepageRowType(row)}</td>
                          <td />
                          <td />
                        </tr>
                      ))
                    ) : (
                      <tr aria-label={`${teamspace.name} contents`}>
                        <td className="h-8 text-content-secondary" colSpan={5}>
                          No pages yet
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamspaceAccessIcon({ accessMode }: { accessMode: TeamspaceAccessMode }) {
  if (accessMode === "open") return <Globe2Icon className="size-4 text-content-secondary" />;
  if (accessMode === "private") return <LockIcon className="size-4 text-content-secondary" />;
  return <UsersIcon className="size-4 text-content-secondary" />;
}
