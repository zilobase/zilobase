#!/usr/bin/env node

import { readFile } from "node:fs/promises"

const checks = {
  ".env.selfhost.example": ["GMAIL_TOKEN_ENCRYPTION_KEY", "GMAIL_PUBSUB_SUBSCRIPTION"],
  "apps/server/.env.example": ["mail/oauth/google/callback", "GMAIL_GOOGLE_CLIENT_ID"],
  "docker-compose.yml": ["GMAIL_GOOGLE_CLIENT_SECRET", "GMAIL_PUBSUB_PUSH_AUDIENCE"],
  "docs/mail/gmail-deployment.md": [
    "gmail-api-push@system.gserviceaccount.com",
    "gcloud pubsub subscriptions create",
    "mail/oauth/google/callback",
    "mail/google/pubsub",
    "advancePendingMailIndexes",
    "mail.database_sync",
    "Restricted-scope production gate",
    "Staging canary",
  ],
  "docs/self-hosting/operations.md": [
    "Workspace Mail",
    "drainMailDatabaseSyncOutbox",
    "mail.index",
  ],
}

for (const [filename, required] of Object.entries(checks)) {
  const contents = await readFile(new URL(`../../${filename}`, import.meta.url), "utf8")
  for (const value of required) {
    if (!contents.includes(value)) throw new Error(`${filename} is missing required Gmail deployment guidance: ${value}`)
  }
}

console.info("Gmail deployment documentation checks passed.")
