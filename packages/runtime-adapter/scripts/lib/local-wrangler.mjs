const defaultClientUrls = [
  "http://localhost:1420",
  "http://demo.localhost:1420",
  "http://127.0.0.1:1420",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].join(",");

export function workerStackDevArgs(env = {}) {
  const port = value(env, "ZILOBASE_ADAPTER_PORT", "3000");
  return [
    ...baseArgs({
      envFile: value(env, "ZILOBASE_WRANGLER_ENV_FILE", ".env.development"),
      inspectorPort: value(env, "ZILOBASE_INSPECTOR_PORT", "9231"),
      ip: "0.0.0.0",
      persistDir: value(env, "ZILOBASE_WRANGLER_PERSIST_DIR", ".wrangler/state/local"),
      port,
    }),
    "--config",
    "wrangler.jsonc",
    "--config",
    "background-wrangler.jsonc",
    ...variables({
      BETTER_AUTH_URL: value(env, "BETTER_AUTH_URL", `http://localhost:${port}`),
      CLIENT_URL: value(env, "CLIENT_URL", defaultClientUrls),
      COLLABORATION_WEBSOCKET_URL: value(
        env,
        "COLLABORATION_WEBSOCKET_URL",
        `ws://localhost:${port}/collaboration`,
      ),
      DATABASE_REALTIME_WEBSOCKET_URL: value(
        env,
        "DATABASE_REALTIME_WEBSOCKET_URL",
        `ws://localhost:${port}/database-collaboration`,
      ),
      MEETING_AUDIO_WEBSOCKET_URL: value(
        env,
        "MEETING_AUDIO_WEBSOCKET_URL",
        `ws://localhost:${port}/meeting-audio`,
      ),
      MEETING_COLLABORATION_WEBSOCKET_URL: value(
        env,
        "MEETING_COLLABORATION_WEBSOCKET_URL",
        `ws://localhost:${port}/meeting-collaboration`,
      ),
      NAVIGATION_REALTIME_WEBSOCKET_URL: value(
        env,
        "NAVIGATION_REALTIME_WEBSOCKET_URL",
        `ws://localhost:${port}/navigation-realtime`,
      ),
      AI_DEV_TOOLS_ENABLED: "true",
      AI_AGENT_DAILY_USAGE_LIMITS_ENABLED: "false",
      MEETING_BLOCK_ENABLED: "true",
      CALENDAR_ENABLED: value(env, "CALENDAR_ENABLED", "false"),
      CALENDAR_ENABLED_WORKSPACE_IDS: value(env, "CALENDAR_ENABLED_WORKSPACE_IDS", ""),
      CALENDAR_WEBHOOK_URL: value(env, "CALENDAR_WEBHOOK_URL", ""),
      MAIL_ENABLED: value(env, "MAIL_ENABLED", "false"),
      ZILOBASE_DEV_EMAIL_SINK_URL: value(
        env,
        "ZILOBASE_DEV_EMAIL_SINK_URL",
        "",
      ),
      DATABASE_AUTOMATIONS_ENABLED: value(env, "DATABASE_AUTOMATIONS_ENABLED", "true"),
      DATABASE_AUTOMATIONS_EXECUTION_DISABLED: value(
        env,
        "DATABASE_AUTOMATIONS_EXECUTION_DISABLED",
        "false",
      ),
      AUTOMATION_WEBHOOKS_ENABLED: value(env, "AUTOMATION_WEBHOOKS_ENABLED", "false"),
      AUTOMATION_SLACK_ENABLED: value(env, "AUTOMATION_SLACK_ENABLED", "false"),
      ZILOBASE_DEMO_ENABLED: value(env, "ZILOBASE_DEMO_ENABLED", "false"),
      ZILOBASE_CELL_ID: value(env, "ZILOBASE_CELL_ID", "default"),
      ZILOBASE_ADAPTER_PORT: port,
    }),
  ];
}

function baseArgs({ envFile, inspectorPort, ip, persistDir, port }) {
  return [
    "dev",
    "--local",
    "--show-interactive-dev-session=false",
    "--persist-to",
    persistDir,
    "--env-file",
    envFile,
    "--ip",
    ip,
    "--port",
    port,
    "--inspector-port",
    inspectorPort,
  ];
}

function variables(entries) {
  return Object.entries(entries).flatMap(([name, entryValue]) => [
    "--var",
    `${name}:${entryValue}`,
  ]);
}

function value(env, name, fallback) {
  const candidate = env[name];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
}
