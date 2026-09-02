# Slack automation connector

Slack automation actions are gated by `AUTOMATION_SLACK_ENABLED=true` and require `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `AUTOMATION_SECRET_ENCRYPTION_KEY`. The Slack application callback is `/automation-slack/oauth/callback`; its bot scopes are limited to `chat:write`, `channels:read`, and `groups:read`.

Connections are owned by the user who completed OAuth and are restricted to the Zilobase workspace in which OAuth started. Tokens and PKCE verifiers are encrypted at rest. Channel discovery requests only public and private channels visible to the bot; direct messages and multi-person direct messages are excluded.

Each delivery uses a stable `client_msg_id` and a durable Zilobase delivery receipt. Rate limits and transient provider failures retry with the same ID. Token revocation marks the connection revoked, pauses dependent automations in an error state, and requires an explicit reconnect and resume.

Message text is escaped before Slack `mrkdwn` rendering. Structured links, user/channel mentions, and automation variables are supported. Formula expressions must first be assigned by a Define variables action and referenced as a variable from the Slack message.
