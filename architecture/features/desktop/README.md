# Desktop integration

## Owning modules and interface

- [apps/web/src/features/desktop](../../../apps/web/src/features/desktop)
- [apps/desktop/electron/main](../../../apps/desktop/electron/main)
- [apps/desktop/electron/sidecar/src](../../../apps/desktop/electron/sidecar/src)

## Main flow

Web desktop modules coordinate connection selection, native authentication, network transport, tabs, persistence, window behavior and diagnostics. Electron main supplies the versioned preload bridge and supervises the audio sidecar. [Native lifecycle](native-lifecycle.md) explains app composition, server contracts/profile state, configuration/discovery, authentication and diagnostics together.

## Authorization and persistence

Persisted selected-server/account state and keychain credentials have different owners. Authentication and server replacement cross web/native seams; existing command and storage identifiers are compatibility requirements.

## Side effects, failures and recovery

Deep-link completion, network failures, server replacement and window cleanup have distinct recovery flows. [App runtime composition](../../../apps/web/src/app/runtime) owns query cancellation, cache cleanup, credential forgetting and reload ordering. Desktop feature modules own replacement requests and switch progress; startup installs the concrete switch executor before rendering.

## Verification and change points

Start with [the packaged desktop smoke test](../../../apps/desktop/e2e/electron-smoke.mjs) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
