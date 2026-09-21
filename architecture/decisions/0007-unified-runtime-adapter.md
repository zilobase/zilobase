# Unified runtime adapter

Status: superseded by [ADR 0008](0008-runtime-ports-and-controller-inversion.md).

## Context

Zilobase ran two runtimes from two repositories: the Node runtime in the public `zilobase` repo (`apps/server/src/app/node/`, `infrastructure/node/`) and the Cloudflare Workers runtime in the private adapter repo (`runtime/`, `features/`, `worker.ts`). The Workers runtime imported deep server internals, the Node runtime hard-wired Zilobase policy (edition registry, production asserts, Redis/RTC singletons) at construction, and community self-hosting on Workers required copying hosted code that mixed credentials, hostnames, and telemetry with mechanism. Any drift between the two realtime paths (collaboration, database, meeting audio, calendar, mail, navigation) risked silent behavior divergence.

## Decision

House both runtimes in one community package, `@zilobase/runtime-adapter` (`packages/runtime-adapter/`), behind isolated subpaths (`./node`, `./worker`) with a shared dependency-free root (`.`). The package:

- owns `ServerRuntimeAdapter`, `WorkerEnvBindings`, capability helpers, `resolveRuntimeKind`, and a dynamic-import-only dispatcher;
- builds the Node runtime through a `loadApp` + hooks factory so Zilobase wiring (edition extension, production asserts, bus, transports, coordinators) is injected rather than imported;
- builds the Worker through `createWorker`/`createBackgroundWorker` factories so hosted identity, the demo guard, and PostHog reporters are injected while community defaults (no extension, console reporter, no demo guard, core CORS) apply without hosted env vars;
- ships placeholder-only Cloudflare deploy templates whose DO bindings, migration history, queues, rate limits, and aliases stay byte-identical to the hosted composition (guarded by `template-parity` tests);
- bans `node/* <-> worker/*` cross-imports and heavy/workerd dependencies per side (guarded by `community-boundary` tests).

The private repo becomes `zilobase-cloud` (`@zilobase/cloud`): thin `createWorker`/`createBackgroundWorker`/`createWebGateway` wrappers plus gated files only (hosted demo, identity extension, PostHog observability, hosted edition, prod wranglers, deploy scripts).

## Alternatives considered

- **Worker-only package (`worker-runtime`)**: rejected; a second package doubles the seam surface and leaves the Node/Workers realtime paths free to diverge. One package with enforced subpath isolation keeps both dispatch tables side by side.
- **Full dependency inversion for realtime rooms**: rejected for this pass; the seven Durable Object rooms and the Node websocket attachments keep importing the published server seams (`adapter-api`, `node-adapter-api`) as values. Only contracts/capabilities/resolve and the two factory signatures are seam-pure. Deeper inversion can follow without changing the package shape.
- **Keeping the adapter private**: rejected; community Cloudflare self-hosting was the goal, and only policy/credentials/hostnames/telemetry need to stay private.

## Consequences

- No behavior change in production during the move; Durable Object migration tags `v1..v14 + calendar-v1`, queue names, and route paths are frozen.
- The temporary `apps/server` re-export shims were retired after the runtime-port reset; `adapter-api`/`node-adapter-api` remain the only server surfaces the adapter consumes.
- Vitest `importOriginal()` must not be used on the cyclic `node-adapter-api` seam in adapter tests (it breaks mock identity for the runtime module); source real implementations from the acyclic `adapter-api` surface instead.
- Follow-ups live outside this decision: deeper room-level inversion, publishing the adapter to a registry, and the GitHub-side `zilobase-cloud` repo rename.

Owning guide: [server runtime](../platform/server-runtime.md). Canonical implementation: [runtime-adapter](../../packages/runtime-adapter/src).
