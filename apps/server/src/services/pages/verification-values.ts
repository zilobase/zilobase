import { deriveContentVerification } from "@zilobase/features/search";

type VerificationPage = Parameters<typeof deriveContentVerification>[0] & {
  id: string;
  createdAt: Date | string;
};

/** Verification properties are projections of page trust metadata, never free text. */
export function verificationPropertyValues(
  page: VerificationPage,
  properties: ReadonlyArray<{ id: string; type: string }>,
) {
  const verification = deriveContentVerification(page);
  const createdAt = new Date(page.createdAt).toISOString();
  return properties
    .filter((property) => property.type === "verification")
    .map((property) => ({
      id: property.id,
      pageId: page.id,
      propertyId: property.id,
      createdAt,
      updatedAt: verification.revision ?? createdAt,
      value: verification,
    }));
}
