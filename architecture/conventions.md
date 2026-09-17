# Module and naming conventions

Group implementation by capability, then by responsibility where that makes changes local. A small feature can stay flat. Large features should name capabilities such as publication, execution or sync before introducing model, hooks or adapters.

A **module** presents one deliberate **interface**. That interface includes invariants, error modes, required configuration and ordering constraints. Keep implementation private so callers gain **leverage** and maintainers gain **locality**. An **adapter** fills a real **seam**; add one for actual runtime variation or a justified production/test pair.

## Naming and imports

- Use kebab-case TypeScript filenames and directories, PascalCase React exports/types, camelCase functions, and useSomething hooks. Rust retains snake_case.
- Put route screens in screens. Preserve framework-required and generated filenames.
- Prefer capability names over new generic service, helpers or utils files. Keep coherent existing modules intact until their responsibility changes.
- Use relative imports inside a module and explicit documented entrypoints between features. An index exposes the module interface; it is not a dump of all implementation exports.
- Keep contracts and pure models independent of React, browser state and server runtime code.
- App composition owns feature orchestration. Shared code and runtime mechanisms must not import their feature callers.
- Keep external package subpaths, HTTP routes, Tauri commands, environment keys and storage formats compatible during internal refactoring.

Web feature rules no longer allow app composition imports. Settings use the provider query client; app providers install demo cache behavior; edition alias consumers use the focused edition contract zone. Published compatibility exports remain intentional, while unused internal UI and wrappers are removed.

These are the direction for new and refactored code. Narrowing existing exceptions requires migrating callers and tests in the same change. File length signals a review, not an automatic split.

## Documentation and verification

Document the implemented system in the owning feature/platform guide. Include the interface, flow, access rules, persistence, side effects, failures and tests; link operational commands instead of copying them. Put domain vocabulary in [CONTEXT.md](../CONTEXT.md). Record a lasting tradeoff in [decisions](decisions/README.md).

Tests should exercise observable behavior through the module interface. Source assertions are suitable for structural rules, not proof of concurrency, authorization or recovery. Keep established test runners and replace brittle assertions only after equivalent protection exists.
