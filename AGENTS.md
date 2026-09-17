# Working in Zilobase

These instructions apply to this Git repository and its descendants. Adjacent
Zilobase repositories are separate projects; change them only when requested.

## Architecture maintenance

1. Before changing code, read [architecture/README.md](architecture/README.md) and
   [CONTEXT.md](CONTEXT.md), then inspect the implementation in the affected area.
   Read relevant decisions in `architecture/decisions/` when that directory exists. Code is the
   evidence for current behavior; correct documentation that disagrees with it.
2. In the same change, update the affected `architecture/` guides whenever module ownership,
   dependency direction, an entrypoint or published contract, persistence,
   authorization, a runtime adapter, or a cross-module flow changes. Include
   additions, moves, and deletions. Update affected source links and diagrams.
3. Keep the affected `architecture/` guides focused on the implemented system, with links to
   canonical code. Replace obsolete descriptions instead of appending progress
   logs. Put new or clarified domain terms in `CONTEXT.md`. Keep proposals and
   temporary architecture reviews outside the repository until a decision is made.
4. For a lasting architectural decision with meaningful rejected alternatives,
   record the rationale in `architecture/decisions/` and link it from the architecture map.
   Create that directory only when there is a decision to record.
5. Before finishing, check the diff against the architecture map, verify changed
   local documentation links, and run checks appropriate to the changed behavior
   using the current package scripts. Report the architecture sections updated,
   or explicitly state why the change has no architecture impact. Documentation
   maintenance is part of completion, not a follow-up task.

For setup or operational changes, also update the affected contributor guide or
runbook. Keep command definitions and enforcement thresholds in their existing
configuration files; link to them instead of copying values into this file.

## Vendored repositories

This project vendors external repositories under [repos/](repos/).

- Use vendored repositories as read-only reference material when working with
  related libraries.
- Prefer examples and patterns from the vendored source code over generated
  guesses or web search results.
- Do not edit files under [repos/](repos/) unless explicitly asked.
- Do not import from [repos/](repos/). Application code should continue importing
  from normal package dependencies.

When writing Effect code, read [repos/effect/LLMS.md](repos/effect/LLMS.md)
first, then inspect [repos/effect/](repos/effect/) for idiomatic usage, tests,
module structure, and API design. Treat it as the source of truth for Effect
patterns.

Server Effect code belongs in `@zilobase/server`. Put shared runtime helpers in
[apps/server/src/infrastructure/effect](apps/server/src/infrastructure/effect)
and feature services with the owning feature. Run programs through
`ManagedRuntime`; keep Hono as the HTTP adapter. Decode untrusted input with
`Schema` and fail with `Schema.TaggedError`. JSON POST bodies on migrated
routes use [parseJsonBody](apps/server/src/shared/http/schema-json.ts). Database work in Effect programs uses
[Db](apps/server/src/infrastructure/database/db.ts) (`withEnv`) rather than
calling `runWithDbEnv` directly. Object-storage work uses
[ObjectStorage](apps/server/src/infrastructure/storage/object-storage.ts)
rather than calling `createImageStorage` directly. Import `effect`, not
`repos/effect`.
