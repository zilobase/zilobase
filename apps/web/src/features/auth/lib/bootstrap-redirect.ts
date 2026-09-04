const bootstrapRequiredMessage =
  "this zilobase instance must be bootstrapped before registration."

export function isBootstrapRequiredAuthError(error: unknown) {
  if (typeof error !== "string") return false

  const normalized = error.trim().replaceAll("_", " ").toLowerCase()
  return (
    normalized === "bootstrap required" ||
    normalized === bootstrapRequiredMessage
  )
}
