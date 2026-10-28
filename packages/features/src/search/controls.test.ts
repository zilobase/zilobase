import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWorkspaceSearch, deriveContentVerification } from "./controls";
import { searchAvailabilityNotice } from "./contracts";

test("semantic availability distinguishes disabled, building, degraded and genuine zero matches", () => {
  assert.match(
    searchAvailabilityNotice({
      mode: "semantic",
      indexAvailability: "disabled",
      degradationReason: "workspace_disabled",
    }) ?? "",
    /disabled in this workspace/,
  );
  assert.match(
    searchAvailabilityNotice({ mode: "semantic", indexAvailability: "building" }) ?? "",
    /still indexing/,
  );
  assert.match(
    searchAvailabilityNotice({
      mode: "semantic",
      indexAvailability: "ready",
      degradationReason: "provider_timeout",
    }) ?? "",
    /temporarily unavailable or degraded/,
  );
  assert.equal(
    searchAvailabilityNotice({ mode: "semantic", indexAvailability: "ready" }),
    undefined,
  );
  assert.equal(
    searchAvailabilityNotice({ mode: "keyword", indexAvailability: "disabled" }),
    undefined,
  );
});

test("structured search normalizes sets, dates and defaults", () => {
  const result = normalizeWorkspaceSearch({
    filters: { pageIds: ["b", "a", "b"], createdAt: { onOrAfter: "2026-01-01T05:30:00+05:30" } },
  });
  assert.deepEqual(result.filters?.pageIds, ["a", "b"]);
  assert.equal(result.filters?.createdAt?.onOrAfter, "2026-01-01T00:00:00.000Z");
  assert.equal(result.limit, 10);
});
test("empty discovery requires narrowing constraints", () => {
  for (const input of [
    {},
    { sort: "title_asc" },
    { filters: { titleOnly: true } },
    { types: ["page", "database"] },
    { filters: { contentStatus: ["verified", "expired", "unverified"] } },
  ])
    assert.throws(() => normalizeWorkspaceSearch(input as never));
  assert.equal(normalizeWorkspaceSearch({ types: ["page"] }).query, "");
});
test("strict validation rejects bad ranges, limits and user combinations", () => {
  for (const input of [
    { query: "x", limit: 51 },
    { query: "x", extra: true },
    { filters: { createdAt: { before: "2026-01-01" } } },
    {
      filters: { createdAt: { onOrAfter: "2026-02-01T00:00:00Z", before: "2026-01-01T00:00:00Z" } },
    },
    { queryType: "user" },
    { queryType: "user", query: "Ada", sort: "relevance" },
    { queryType: "user", query: "Ada", filters: {} },
  ])
    assert.throws(() => normalizeWorkspaceSearch(input as never));
  assert.equal(normalizeWorkspaceSearch({ queryType: "user", query: "Ada", limit: 50 }).limit, 50);
});
test("verification expires at the boundary and survives verifier removal", () => {
  assert.equal(deriveContentVerification({}).state, "unverified");
  assert.equal(
    deriveContentVerification({ verifiedAt: "2026-01-01", verifiedById: null }).state,
    "verified",
  );
  assert.equal(
    deriveContentVerification(
      { verifiedAt: "2026-01-01", verificationExpiresAt: "2026-02-01" },
      Date.parse("2026-02-01"),
    ).state,
    "expired",
  );
});
