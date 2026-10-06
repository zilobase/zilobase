# Tasks

## Owning modules and interface

- [apps/web/src/features/tasks](../../../apps/web/src/features/tasks)

## Main flow

The [tasks screen](../../../apps/web/src/features/tasks/screens/tasks.tsx) derives task-oriented presentation using database data and a [database-list adapter](../../../apps/web/src/features/tasks/components/task-database-list-adapter.tsx). The [task model](../../../apps/web/src/features/tasks/model/tasks-model.ts) derives schema/status/assignee decisions; the screen coordinates selected task databases, completion mutations and navigation. Task models belong to this feature; row/property persistence stays with database operations.

## Authorization and persistence

Database and page access constrain the data shown and commands available. This web feature does not define a separate server task store.

## Side effects, failures and recovery

Edits flow through database mutations and their cache/realtime behavior. Keep task grouping and navigation compatible with the database representation.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/src/features/tasks/model/tasks-model.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

Task complete-read queries retain [export references](../../../packages/features/src/databases/export-references.ts). Mounted task and sidebar lists subscribe to shared publications and resolve a coherent current snapshot; normal cell/definition acknowledgements update their values without repeating the complete HTTP read. Record membership changes refresh only affected source context results.
