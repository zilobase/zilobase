#!/usr/bin/env node

import { config as loadEnv } from "@dotenvx/dotenvx"

import { validateGmailDeploymentConfig } from "./gmail-deployment-config.mjs"

try {
  const envFile = process.argv.find((argument) => argument.startsWith("--env-file="))?.slice("--env-file=".length)
  if (envFile) {
    loadEnv({
      path: envFile,
      quiet: true,
      ignore: ["MISSING_ENV_FILE"],
      noOps: true,
    })
  }
  const result = validateGmailDeploymentConfig(process.env)
  if (!result.enabled) {
    console.info("Gmail deployment: disabled")
  } else {
    console.info(`Gmail deployment: valid (${result.pushEnabled ? "OAuth and push" : "OAuth with local synchronization"})`)
    console.info(`OAuth callback: ${result.callbackUrl}`)
    if (result.pushEnabled) console.info(`Pub/Sub webhook and audience: ${result.webhookUrl}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Gmail deployment configuration is invalid.")
  process.exitCode = 1
}
