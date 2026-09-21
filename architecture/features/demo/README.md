# Hosted demo

## Owning modules and interface

- [apps/web/src/features/demo](../../../apps/web/src/features/demo)
- [apps/server/src/features/demo](../../../apps/server/src/features/demo)

## Main flow

The browser demo transport overlays reads and intercepts selected mutations. Server demo modules define request identity, seed data and write guards. [App providers](../../../apps/web/src/app/providers/app-providers.tsx) install the demo cache once during module initialization, before rendering providers. Demo presentation does not import the app query client. App composition selects demo behavior. The [request classifier](../../../apps/server/src/features/demo/request.ts) requires the configured demo flag and matching header; feature operations consume the resulting auth method. The [demo transport](../../../apps/web/src/features/demo/transport.ts) stays behind app-installed runtime policy rather than selecting itself inside authentication.

## Authorization and persistence

Demo state must remain separate from ordinary authenticated writes. Seed data uses existing content schema; request/write guards enforce the demo behavior on the server.

## Side effects, failures and recovery

Client mutation interception is not a replacement for server protection. Preserve guard errors and overlay behavior; do not run seed operations as ordinary refactor tests.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/demo/demo.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
