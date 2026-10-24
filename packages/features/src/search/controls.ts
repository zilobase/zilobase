import { z } from "zod";

const ids = z
  .array(z.string().trim().min(1).max(128))
  .min(1)
  .max(50)
  .transform((values) => [...new Set(values)].sort());
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
export const searchDateRangeSchema = z
  .object({
    onOrAfter: instant.optional(),
    before: instant.optional(),
  })
  .strict()
  .refine((range) => Boolean(range.onOrAfter || range.before), "A date bound is required")
  .refine(
    (range) => !range.onOrAfter || !range.before || range.onOrAfter < range.before,
    "Date range must increase",
  );
export const contentStatusSchema = z.enum(["verified", "unverified", "expired"]);
export const workspaceSearchFiltersSchema = z
  .object({
    pageIds: ids.optional(),
    dataSourceIds: ids.optional(),
    teamspaceIds: ids.optional(),
    createdByUserIds: ids.optional(),
    editedByUserIds: ids.optional(),
    createdAt: searchDateRangeSchema.optional(),
    lastEditedAt: searchDateRangeSchema.optional(),
    titleOnly: z.boolean().optional(),
    contentStatus: z
      .array(contentStatusSchema)
      .min(1)
      .max(3)
      .transform((values) => [...new Set(values)].sort())
      .optional(),
  })
  .strict();
export const workspaceSearchSortSchema = z.enum([
  "relevance",
  "created_asc",
  "created_desc",
  "last_edited_asc",
  "last_edited_desc",
  "title_asc",
  "title_desc",
]);
export const workspaceSearchRequestSchema = z
  .object({
    query: z.string().trim().max(512).default(""),
    queryType: z.enum(["content", "user"]).default("content"),
    types: z
      .array(z.enum(["page", "database"]))
      .max(2)
      .transform((values) => [...new Set(values)].sort())
      .default([]),
    filters: workspaceSearchFiltersSchema.optional(),
    sort: workspaceSearchSortSchema.optional(),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.queryType === "user") {
      if (!request.query)
        context.addIssue({
          code: "custom",
          path: ["query"],
          message: "User lookup requires a query",
        });
      if (request.filters !== undefined || request.sort !== undefined || request.types.length)
        context.addIssue({
          code: "custom",
          message: "User lookup does not accept content filters, types or sorting",
        });
    } else if (!request.query && !hasSearchConstraint(request)) {
      context.addIssue({
        code: "custom",
        path: ["query"],
        message: "A query or narrowing filter is required",
      });
    }
  });
export type WorkspaceSearchFilters = z.output<typeof workspaceSearchFiltersSchema>;
export type WorkspaceSearchSort = z.output<typeof workspaceSearchSortSchema>;
export type WorkspaceSearchRequest = z.output<typeof workspaceSearchRequestSchema>;
export type WorkspaceSearchRequestInput = z.input<typeof workspaceSearchRequestSchema>;
export type ContentStatus = z.output<typeof contentStatusSchema>;
export type ContentVerification = {
  state: ContentStatus;
  verifiedAt: string | null;
  verifiedById: string | null;
  expiresAt: string | null;
  revision: string | null;
};
export type SearchUser = { id: string; name: string; email: string };
export type SearchResultMetadata = {
  createdAt: string;
  createdById: string | null;
  lastEditedAt: string;
  lastEditedById: string | null;
  verification: ContentVerification;
};
export function hasSearchConstraint(request: {
  types?: string[];
  filters?: WorkspaceSearchFilters;
}) {
  if (request.types?.length === 1) return true;
  const filters = request.filters;
  return Boolean(
    filters &&
    Object.entries(filters).some(
      ([key, value]) =>
        key !== "titleOnly" &&
        (Array.isArray(value)
          ? value.length > 0 && !(key === "contentStatus" && value.length === 3)
          : Boolean(value)),
    ),
  );
}
export function normalizeWorkspaceSearch(
  input: WorkspaceSearchRequestInput,
): WorkspaceSearchRequest {
  return workspaceSearchRequestSchema.parse(input);
}
export function deriveContentVerification(
  input: {
    verifiedAt?: Date | string | null;
    verifiedById?: string | null;
    verificationExpiresAt?: Date | string | null;
    verificationUpdatedAt?: Date | string | null;
  },
  now = Date.now(),
): ContentVerification {
  const iso = (value?: Date | string | null) => (value ? new Date(value).toISOString() : null);
  const verifiedAt = iso(input.verifiedAt);
  const expiresAt = iso(input.verificationExpiresAt);
  return {
    state: !verifiedAt
      ? "unverified"
      : expiresAt && Date.parse(expiresAt) <= now
        ? "expired"
        : "verified",
    verifiedAt,
    verifiedById: input.verifiedById ?? null,
    expiresAt,
    revision: iso(input.verificationUpdatedAt),
  };
}
