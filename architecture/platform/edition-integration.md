# Edition integration

## Interface and flow

External adapters compose the core server through its published exports. A server edition creates its Better Auth plugins asynchronously for each request through `createAuthPlugins({ database, env, request })`; plugins must not capture another request's database or environment. After core session normalization and active-membership validation, an edition may apply additional policy through `assertSession`. The hook receives the request and concrete session ID so assurance can be bound to the session that proved it while narrowly exempting its own factor-verification endpoint. It runs only for cookie/session authentication, never API keys, OAuth bearer tokens, or the hosted demo, and may return a stable 401/403 denial.

Web composition selects edition behavior through the `@zilobase/edition-web` alias. `ZILOBASE_WEB_EDITION_MODULE` may point Vite and the web test harness at an external edition module; leaving it unset selects the empty community module beside its types under `apps/web/src/edition`. Additional login methods receive the shared email value and render immediately below the shared email field. Feature consumers may only use the edition contract.

Start at the [entrypoint](../../apps/server/src/public/adapter-api.ts); follow the [implementation](../../apps/server/package.json) and [related modules](../../apps/web/src/edition/community-module.ts).

## Invariants and failure handling

Optional integrations remain outside the public core. Preserve exported names,
types, and alias contracts without importing implementation packages. Better
Auth packages are pinned together because plugins share its runtime types and
plugin ABI.

## Public boundary

The words SSO and Enterprise may appear in this policy and its automated guard
only to name implementation categories that are prohibited here. This public
repository owns edition-neutral contracts and reusable membership primitives;
it does not own identity-provider configuration, federated account resolution,
provider callbacks, migration or enforcement screens, runtime adapters, or
deployment setup.

Do not record private repository, package, directory, or module identifiers in
public files. Do not add vendor-specific bindings, manifests, environment
variables, or operational instructions. Non-public release tooling may inject
additional restricted package and path markers into the boundary check without
placing those identifiers in this repository.

## Verification

See [tests or test configuration](../../scripts/community-boundary.test.mjs) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).
