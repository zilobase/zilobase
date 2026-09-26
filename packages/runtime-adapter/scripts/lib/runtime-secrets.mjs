export const calendarRuntimeSecretNames = [
  "CALENDAR_GOOGLE_CLIENT_ID",
  "CALENDAR_GOOGLE_CLIENT_SECRET",
  "CALENDAR_TOKEN_ENCRYPTION_KEY",
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

export const runtimeSecretNames = [...coreRuntimeSecretNames, ...calendarRuntimeSecretNames];

export function requiredRuntimeSecretNames({ calendarEnabled = false }) {
  return [...coreRuntimeSecretNames, ...(calendarEnabled ? calendarRuntimeSecretNames : [])];
}

export function requiredBackgroundRuntimeSecretNames({ calendarEnabled = false }) {
  return [
    ...backgroundCoreRuntimeSecretNames,
    ...(calendarEnabled ? calendarRuntimeSecretNames : []),
  ];
}
