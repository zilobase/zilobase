export function isFeatureFlagEnabled(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}
