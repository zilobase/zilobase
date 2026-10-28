import { expect, it } from "vitest";
import { verificationPropertyValues } from "./verification-values";

it("projects verification definitions from page trust without changing editorial timestamps", () => {
  const page = {
    id: "p",
    createdAt: "2026-01-01T00:00:00.000Z",
    verifiedAt: "2026-02-01T00:00:00.000Z",
    verifiedById: "actor",
    verificationUpdatedAt: "2026-02-02T00:00:00.000Z",
  };
  const values = verificationPropertyValues(page, [
    { id: "v", type: "verification" },
    { id: "text", type: "text" },
  ]);
  expect(values).toHaveLength(1);
  expect(values[0]).toMatchObject({
    pageId: "p",
    propertyId: "v",
    updatedAt: page.verificationUpdatedAt,
    value: { state: "verified", verifiedById: "actor", expiresAt: null },
  });
  expect(page.createdAt).toBe("2026-01-01T00:00:00.000Z");
  expect(
    verificationPropertyValues(
      { ...page, verifiedAt: null, verificationUpdatedAt: "2026-02-03T00:00:00.000Z" },
      [{ id: "v", type: "verification" }],
    )[0],
  ).toMatchObject({ updatedAt: "2026-02-03T00:00:00.000Z", value: { state: "unverified" } });
});
