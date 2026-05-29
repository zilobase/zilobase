# @notelab/slack-connector

Slack connector primitives for Notelab.

## Features

- Slack OAuth v2 install URL and token exchange helpers
- Token refresh helper for apps with Slack token rotation enabled
- Lightweight Web API client for auth, canvas, conversation, and file reads

The default OAuth scope set is for organization-wide Slack access through the
Notelab app. It intentionally excludes personal DM, MPIM, notification, and
global search, email/profile scopes. Those belong behind a separate Slack
user-account connector or a dedicated approved Slack search integration.
