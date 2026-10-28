import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePropertyValue } from "./property-values";
import { isReadOnlyTimeProperty } from "./read-only-time";
import { getDatabasePropertyCellKind } from "./property-capabilities";

test("verification values derive real trust and expiry instead of accepting typed labels", () => {
  const value = {
    state: "verified",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    verifiedById: "u",
    expiresAt: null,
    revision: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(getDatabasePropertyCellKind("verification"), "verification");
  assert.equal(isReadOnlyTimeProperty("verification"), false);
  assert.equal(parsePropertyValue("Verified", "verification"), "Unverified");
  assert.equal(parsePropertyValue(value, "verification"), "Verified");
  assert.equal(
    parsePropertyValue({ ...value, expiresAt: "2026-01-02T00:00:00.000Z" }, "verification"),
    "Expired",
  );
  assert.equal(parsePropertyValue({ ...value, verifiedAt: null }, "verification"), "Unverified");
});

import { evaluateDatabaseRecordsForView } from "../views/view-evaluation";
import type { DatabasePropertyEntity, DatabaseRecordEntity } from "../core/entities";
const stamp = "2026-01-01T00:00:00.000Z";
const databasePropertyEntityFixture: DatabasePropertyEntity = {
  id: "column",
  createdAt: stamp,
  updatedAt: stamp,
  dataSourceId: "source",
  propertyId: "property",
  position: 0,
  visible: true,
  width: null,
  property: {
    id: "property",
    createdAt: stamp,
    updatedAt: stamp,
    config: null,
    type: "verification",
    name: "Verification",
    workspaceId: "w",
  },
};
const databaseRecordEntityFixture: DatabaseRecordEntity = {
  id: "row",
  dataSourceId: "source",
  pageId: "p",
  createdAt: stamp,
  updatedAt: stamp,
  orderKey: "1",
  parentRowId: null,
  valuesByPropertyId: {},
  page: {
    id: "p",
    name: "Page",
    createdAt: stamp,
    updatedAt: stamp,
    deletedAt: null,
    hasContent: false,
    metadata: null,
  },
};

test("saved database views filter using the canonical verification status", () => {
  const property = {
    ...databasePropertyEntityFixture,
    property: { ...databasePropertyEntityFixture.property, type: "verification" },
  };
  const value = {
    state: "verified",
    verifiedAt: "2026-01-01T00:00:00.000Z",
    verifiedById: "u",
    expiresAt: null,
    revision: "2026-01-01T00:00:00.000Z",
  };
  const record = (id: string, verification: unknown) => ({
    ...databaseRecordEntityFixture,
    id,
    valuesByPropertyId: {
      [property.property.id]: {
        id: property.property.id,
        pageId: databaseRecordEntityFixture.pageId,
        propertyId: property.property.id,
        createdAt: databaseRecordEntityFixture.createdAt,
        updatedAt: databaseRecordEntityFixture.updatedAt,
        value: verification,
      },
    },
  });
  const verified = record("verified", value),
    expired = record("expired", { ...value, expiresAt: "2026-01-02T00:00:00.000Z" });
  const result = evaluateDatabaseRecordsForView({
    properties: [property],
    records: [verified, expired],
    config: {
      filters: [{ id: "filter", propertyId: property.id, operator: "is", values: ["Verified"] }],
    },
  });
  assert.deepEqual(
    result.map((row) => row.id),
    ["verified"],
  );
});
