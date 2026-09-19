export const calendarRuntimeSecretNames = ["CALENDAR_GOOGLE_CLIENT_ID", "CALENDAR_GOOGLE_CLIENT_SECRET", "CALENDAR_TOKEN_ENCRYPTION_KEY"];
export const gmailRuntimeSecretNames = [
  "GMAIL_GOOGLE_CLIENT_ID",
  "GMAIL_GOOGLE_CLIENT_SECRET",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
  "GMAIL_PUBSUB_TOPIC",
  "GMAIL_PUBSUB_PUSH_AUDIENCE",
  "GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL",
  "GMAIL_PUBSUB_SUBSCRIPTION",
];

const coreRuntimeSecretNames = [
  "BETTER_AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "COLLABORATION_SECRET",
  "ZILOBASE_OPERATIONS_TOKEN",
  "AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "AUTOMATION_SECRET_ENCRYPTION_KEY",
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
];

const backgroundCoreRuntimeSecretNames = [
  "AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "AUTOMATION_SECRET_ENCRYPTION_KEY",
];

const backgroundMailRuntimeSecretNames = [
  "GMAIL_GOOGLE_CLIENT_ID",
  "GMAIL_GOOGLE_CLIENT_SECRET",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
  "GMAIL_PUBSUB_TOPIC",
];

export const runtimeSecretNames = [
  ...coreRuntimeSecretNames,
  ...gmailRuntimeSecretNames,
  ...calendarRuntimeSecretNames,
];

export function requiredRuntimeSecretNames({ mailEnabled, calendarEnabled = false }) {
  return [...coreRuntimeSecretNames, ...(mailEnabled ? gmailRuntimeSecretNames : []), ...(calendarEnabled ? calendarRuntimeSecretNames : [])];
}

export function requiredBackgroundRuntimeSecretNames({ mailEnabled, calendarEnabled = false }) {
  return [...backgroundCoreRuntimeSecretNames, ...(mailEnabled ? backgroundMailRuntimeSecretNames : []), ...(calendarEnabled ? calendarRuntimeSecretNames : [])];
}
