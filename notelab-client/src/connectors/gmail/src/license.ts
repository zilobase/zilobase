import {
  GOOGLE_WORKSPACE_PAID_SKU_IDS,
  GOOGLE_WORKSPACE_PRODUCT_ID,
} from "./constants.js";
import { resolveFetch, type GmailFetch } from "./fetch.js";
import type {
  GoogleWorkspaceLicenseAssignment,
  GoogleWorkspaceLicenseVerificationResult,
} from "./types.js";

const licensingBaseUrls = [
  "https://licensing.googleapis.com",
  "https://www.googleapis.com",
] as const;

export type VerifyGoogleWorkspaceLicenseOptions = {
  accessToken: string;
  fetch?: GmailFetch;
  productId?: string;
  skuIds?: readonly string[];
  userEmail: string;
};

export async function verifyGoogleWorkspacePaidLicense({
  accessToken,
  fetch: fetchImpl,
  productId = GOOGLE_WORKSPACE_PRODUCT_ID,
  skuIds = GOOGLE_WORKSPACE_PAID_SKU_IDS,
  userEmail,
}: VerifyGoogleWorkspaceLicenseOptions): Promise<GoogleWorkspaceLicenseVerificationResult> {
  if (skuIds.length === 0) {
    return { ok: false, status: "not_configured" };
  }

  let badRequest: GoogleWorkspaceLicenseVerificationResult | undefined;
  const safeFetch = resolveFetch(fetchImpl);

  for (const baseUrl of licensingBaseUrls) {
    for (const skuId of skuIds) {
      const endpoint = `${baseUrl}/apps/licensing/v1/product/${encodeURIComponent(
        productId,
      )}/sku/${encodeURIComponent(skuId)}/user/${encodeURIComponent(userEmail)}`;
      const response = await safeFetch(endpoint, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        return {
          ok: true,
          assignment: (await response.json()) as GoogleWorkspaceLicenseAssignment,
          status: "verified",
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          endpoint,
          httpStatus: response.status,
          message: await readGoogleErrorMessage(response),
          ok: false,
          status: "admin_required",
        };
      }

      if (response.status === 400) {
        badRequest ??= {
          endpoint,
          httpStatus: response.status,
          message: await readGoogleErrorMessage(response),
          ok: false,
          status: "bad_request",
        };
        continue;
      }

      if (response.status !== 404) {
        return {
          endpoint,
          httpStatus: response.status,
          message: await readGoogleErrorMessage(response),
          ok: false,
          status: "api_unavailable",
        };
      }
    }
  }

  if (badRequest) {
    return badRequest;
  }

  return { ok: false, status: "license_not_found" };
}

async function readGoogleErrorMessage(response: Response) {
  try {
    const body = (await response.clone().json()) as {
      error?: { message?: string };
    };

    return body.error?.message;
  } catch {
    return undefined;
  }
}
