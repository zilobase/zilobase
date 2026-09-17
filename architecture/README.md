# Zilobase architecture

This directory describes the implemented core repository. Start with the [system overview](system-overview.md), [repository map](repository-map.md), and [module conventions](conventions.md). Domain vocabulary lives in [CONTEXT.md](../CONTEXT.md).

## Feature guides

Each guide follows a capability through its web, shared-package, server and native modules. Source links identify the implementation; operational instructions stay in runbooks.

- [Authentication](features/auth/README.md)
- [API keys](features/api-keys/README.md)
- [Workspaces](features/workspaces/README.md)
- [Memberships](features/memberships/README.md)
- [Teamspaces](features/teamspaces/README.md)
- [Access decisions](features/access/README.md)
- [Pages](features/pages/README.md)
- [Page guests](features/page-guests/README.md)
- [Publication and sharing](features/publication/README.md)
- [Editor](features/editor/README.md)
- [Collaboration](features/collaboration/README.md)
- [Comments](features/comments/README.md)
- [Databases](features/databases/README.md)
- [Database automations](features/automations/README.md)
- [AI conversations and agents](features/ai/README.md)
- [Calendar](features/calendar/README.md)
- [Mail](features/mail/README.md)
- [Meetings](features/meetings/README.md)
- [Notifications](features/notifications/README.md)
- [Navigation](features/navigation/README.md)
- [Library](features/library/README.md)
- [Tasks](features/tasks/README.md)
- [Search](features/search/README.md)
- [User settings](features/settings/README.md)
- [Canvas](features/canvas/README.md)
- [Notion import](features/notion-import/README.md)
- [Clips](features/clips/README.md)
- [Offline documents](features/offline/README.md)
- [Desktop integration](features/desktop/README.md)
- [Hosted demo](features/demo/README.md)
- [Instance and operational endpoints](features/instance/README.md)

## Platform

- [Background work](platform/background-work.md)
- [Desktop runtime](platform/desktop-runtime.md)
- [Edition integration](platform/edition-integration.md)
- [Persistence](platform/persistence.md)
- [Realtime](platform/realtime.md)
- [Server runtime](platform/server-runtime.md)
- [Shared packages](platform/shared-packages.md)
- [Web runtime](platform/web-runtime.md)

## Setup

- [Configuration](setup/configuration.md)
- [Containers and helm](setup/containers-and-helm.md)
- [Local development](setup/local-development.md)
- [Release and upgrades](setup/release-and-upgrades.md)
- [Self hosting](setup/self-hosting.md)
- [Testing and quality](setup/testing-and-quality.md)

## Decisions and maintenance

[Architecture decisions](decisions/README.md) explain lasting tradeoffs. Update the affected guide with each implementation change and verify local links. These guides describe current behavior, not pending refactor passes.
