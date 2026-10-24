import { sql, type SQL } from "drizzle-orm";
import { searchAccessCtes } from "./eligibility";
import type { WorkspaceSearchInput } from "./workspace-search";

export type KeywordCandidate = {
  id: string;
  type: "page" | "database";
  title: string;
  path: string;
  emoji: string | null;
  excerpt: string | null;
};
const set = (values: readonly string[]) =>
  sql`select jsonb_array_elements_text(${JSON.stringify(values)}::jsonb)`;
function metadataFilters(input: WorkspaceSearchInput, alias: "p" | "d") {
  const f = input.filters;
  const conditions: SQL[] = [];
  for (const [ids, column] of [
    [f?.createdByUserIds, "created_by_id"],
    [f?.editedByUserIds, "last_edited_by_id"],
  ] as const) {
    if (ids?.length)
      conditions.push(
        sql`${sql.identifier(alias)}.${sql.identifier(column)} in (${set(ids.map((id) => (id === "me" ? input.userId : id)))})`,
      );
  }
  if (f?.teamspaceIds?.length)
    conditions.push(sql`${sql.identifier(alias)}.teamspace_id in (${set(f.teamspaceIds)})`);
  for (const [range, column] of [
    [f?.createdAt, "created_at"],
    [f?.lastEditedAt, "last_edited_at"],
  ] as const) {
    const field = sql`${sql.identifier(alias)}.${sql.identifier(column)}`;
    if (range?.onOrAfter) conditions.push(sql`${field} >= ${range.onOrAfter}::timestamptz`);
    if (range?.before) conditions.push(sql`${field} < ${range.before}::timestamptz`);
  }
  if (f?.contentStatus?.length)
    conditions.push(
      sql`(case when ${sql.identifier(alias)}.verified_at is null then 'unverified' when ${sql.identifier(alias)}.verification_expires_at <= statement_timestamp() then 'expired' else 'verified' end) in (${set(f.contentStatus)})`,
    );
  return conditions.length ? sql.join(conditions, sql` and `) : sql`true`;
}
/** Every matching/ACL predicate is evaluated before the single final LIMIT. */
export function keywordCandidateQuery(input: WorkspaceSearchInput) {
  const w = input.workspaceId;
  const query = input.query.trim();
  const q = sql`websearch_to_tsquery('simple', ${query})`;
  const types = input.types ?? ["page", "database"];
  const f = input.filters;
  const pageMatch = query
    ? f?.titleOnly
      ? sql`to_tsvector('simple',p.name) @@ ${q}`
      : sql`s.search_vector @@ ${q}`
    : sql`true`;
  const pages = sql`select p.id from page p join search_document s on s.workspace_id=p.workspace_id and s.source_type='page' and s.source_id=p.id where p.workspace_id=${w} and p.deleted_at is null and ${metadataFilters(input, "p")} and ${pageMatch}
    ${f?.pageIds?.length ? sql`union select p.id from page p where p.workspace_id=${w} and p.deleted_at is null and p.id in (${set(f.pageIds)})` : sql``}`;
  const databases = sql`select id from database where workspace_id=${w} and deleted_at is null`;
  const location = f?.pageIds?.length
    ? sql`, location_edges as materialized(
    select pl.parent_id,pl.item_id as child_id from page_item_placement pl join page p on p.id=pl.item_id and p.workspace_id=${w} and p.deleted_at is null where pl.workspace_id=${w} and pl.parent_kind='page' and pl.item_kind='page' and pl.placement_kind='primary' and pl.deleted_at is null
    union select d.page_id,r.page_id from database_row r join data_source ds on ds.id=r.data_source_id and ds.workspace_id=${w} and ds.deleted_at is null join database d on d.id=ds.parent_database_id and d.workspace_id=${w} and d.deleted_at is null where r.deleted_at is null and d.page_id is not null
  ), search_location(id,trail) as (
    select p.id,array[p.id] from page p where p.workspace_id=${w} and p.deleted_at is null and p.id in (${set(f.pageIds)}) and p.id in(select id from search_allowed_pages)
    union all select e.child_id,l.trail||e.child_id from search_location l join location_edges e on e.parent_id=l.id where not e.child_id=any(l.trail) and cardinality(l.trail)<64
  )`
    : sql``;
  const locationPage = f?.pageIds?.length
    ? sql`p.id in(select id from search_location)`
    : sql`true`;
  const locationDatabase = f?.pageIds?.length
    ? sql`d.page_id in(select id from search_location)`
    : sql`true`;
  const sourceFilter = f?.dataSourceIds?.length
    ? sql`exists(select 1 from database_row r join data_source ds on ds.id=r.data_source_id and ds.workspace_id=${w} and ds.deleted_at is null where r.page_id=p.id and r.deleted_at is null and ds.id in (${set(f.dataSourceIds)}) and ds.parent_database_id in(select id from search_allowed_databases))`
    : sql`true`;
  const dbMatch = query
    ? f?.titleOnly
      ? sql`to_tsvector('simple',coalesce(heading.name,d.name)) @@ ${q}`
      : sql`(s.search_vector @@ ${q} or to_tsvector('simple',coalesce(heading.name,d.name)) @@ ${q} or exists(select 1 from database_view v where v.database_id=d.id and to_tsvector('simple',v.name) @@ ${q}) or exists(select 1 from database_data_source link join data_source ds on ds.id=link.data_source_id and ds.workspace_id=${w} and ds.deleted_at is null where link.database_id=d.id and ds.parent_database_id in(select id from search_allowed_databases) and to_tsvector('simple',ds.name) @@ ${q}))`
    : sql`true`;
  const sort = input.sort ?? (query ? "relevance" : "title_asc");
  const ordering: Record<string, SQL> = {
    relevance: sql`rank desc`,
    created_asc: sql`created_at asc`,
    created_desc: sql`created_at desc`,
    last_edited_asc: sql`last_edited_at asc`,
    last_edited_desc: sql`last_edited_at desc`,
    title_asc: sql`title asc`,
    title_desc: sql`title desc`,
  };
  return sql`${searchAccessCtes(w, input.userId, pages, databases)}${location}, keyword_matches as (
    select p.id,'page'::text as type,p.name as title,s.path,s.emoji,${f?.titleOnly ? sql`null` : query ? sql`ts_headline('simple',s.content_text,${q},'MaxWords=35, MinWords=10, StartSel=__ZILOBASE_MATCH_START__, StopSel=__ZILOBASE_MATCH_STOP__')` : sql`left(s.content_text,280)`} as excerpt,${query ? sql`ts_rank_cd(s.search_vector,${q})` : sql`0`} as rank,p.created_at,p.last_edited_at
    from page p join search_document s on s.workspace_id=p.workspace_id and s.source_type='page' and s.source_id=p.id
    where p.workspace_id=${w} and p.deleted_at is null and p.id in(select id from search_allowed_pages) and ${types.includes("page")} and ${pageMatch} and ${metadataFilters(input, "p")} and ${locationPage} and ${sourceFilter}
    union all
    select d.id,'database',coalesce(heading.name,d.name),s.path,s.emoji,null,${query ? sql`ts_rank_cd(s.search_vector,${q})` : sql`0`},d.created_at,d.last_edited_at
    from database d join search_document s on s.workspace_id=d.workspace_id and s.source_type='database' and s.source_id=d.id
    left join lateral(
      select ds.name from database_data_source link join data_source ds on ds.id=link.data_source_id and ds.workspace_id=${w} and ds.deleted_at is null
      left join lateral(select v.position,v.id from database_view v where v.database_id=d.id and v.data_source_id=ds.id order by v.position,v.id limit 1) first_view on true
      where link.database_id=d.id and ds.parent_database_id in(select id from search_allowed_databases)
      order by first_view.position nulls last,first_view.id nulls last,link.position,ds.id limit 1
    ) heading on true
    where d.workspace_id=${w} and d.deleted_at is null and d.id in(select id from search_allowed_databases) and ${types.includes("database")} and ${f?.dataSourceIds?.length ? sql`false` : sql`true`} and ${dbMatch} and ${metadataFilters(input, "d")} and ${locationDatabase}
  ) select id,type,title,path,emoji,excerpt from keyword_matches order by ${ordering[sort]},title,type,id limit ${Math.min(50, Math.max(1, input.limit ?? 50))}`;
}
