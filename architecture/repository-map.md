# Repository map

| Module | Responsibility | Canonical implementation |
| --- | --- | --- |
| Web composition | Routing, providers, application shell, edition selection | [app](../apps/web/src/app) |
| Edition interface | Stable web edition contract and empty community implementation | [edition](../apps/web/src/edition) |
| Web features | Feature presentation and interaction state | [features](../apps/web/src/features) |
| Web platform | Transport, credentials, origin resolution and diagnostics | [platform](../apps/web/src/platform) |
| Shared web code | Reusable UI, configuration and browser utilities | [shared](../apps/web/src/shared) |
| Server composition | HTTP routing, Node startup, background dispatch | [app](../apps/server/src/app), [entrypoints](../apps/server/src/entrypoints) |
| Server features | Authorization integration, feature operations and persistence | [features](../apps/server/src/features) |
| Infrastructure | Database context, runtime capabilities, storage, telemetry and Effect runtime | [infrastructure](../apps/server/src/infrastructure), [effect](../apps/server/src/infrastructure/effect), [Db](../apps/server/src/infrastructure/database/db.ts), [ObjectStorage](../apps/server/src/infrastructure/storage/object-storage.ts) |
| Published server interface | Entry points consumed by external runtime adapters | [public](../apps/server/src/public), [exports](../apps/server/package.json) |
| Runtime adapter | Community Node and Cloudflare Worker runtimes, factories, and deploy templates | [runtime-adapter](../packages/runtime-adapter/src), [worker templates](../packages/runtime-adapter/deploy/worker) |
| Runtime ports | Deployment-neutral contracts and provider conformance fixtures | [runtime-ports](../packages/runtime-ports/src) |
| Native host | Authentication, server selection, recording and diagnostics | [Rust modules](../apps/desktop/src-tauri/src) |
| Shared features | Contracts, pure rules, queries and React bindings | [features package](../packages/features/src) |
| Page context | Structural page content and markdown conversion | [page-context](../packages/page-context/src) |
| HTML to page | Webpage HTML sanitization and Tiptap JSON conversion for clips | [html-to-page](../packages/html-to-page/src) |
| Editor utilities | Markdown splitting and comment extension | [splitter](../packages/markdown-text-splitter), [comments](../packages/tiptap-comment-extension) |
| Setup and operations | Development, deployment and release tooling | [scripts](../scripts), [deploy](../deploy), [docker](../docker) |

Capabilities own their models, commands and presentation. Database configuration and value models no longer import view presentation types; presentation options such as icons stay in browser-facing modules. App composition connects runtime policy, demo cache setup and offline cleanup without reverse feature imports. Cross-feature capabilities retain documented interfaces.

Migration SQL under [drizzle](../apps/server/drizzle) is ordered history. Published package exports and edition aliases are compatibility interfaces, even when a consumer lives outside this repository.
