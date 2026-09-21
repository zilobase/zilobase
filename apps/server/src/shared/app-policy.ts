import type { AppPolicy } from "@zilobase/runtime-ports";

export const communityAppPolicy: AppPolicy = {
  compression: true,
  registration: "bootstrap",
  webhookHttpDomains: new Set(),
  workspaceSelection: "pinned",
};

export const managedAppPolicy: AppPolicy = {
  compression: false,
  registration: "managed",
  webhookHttpDomains: new Set(),
  workspaceSelection: "switchable",
};

export function isCommunityRegistration(policy?: AppPolicy) {
  return (policy ?? communityAppPolicy).registration === "bootstrap";
}
