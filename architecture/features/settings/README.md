# User settings

## Owning modules and interface

- [apps/server/src/features/user-settings](../../../apps/server/src/features/user-settings)
- [apps/web/src/features/settings](../../../apps/web/src/features/settings)
- [packages/features/src/user-settings](../../../packages/features/src/user-settings)

## Main flow

User settings routes persist page/layout and profile preferences. Profile and preference JSON patches decode with Schema through [parseJsonBody](../../../apps/server/src/shared/http/schema-json.ts) / [parseUnknown](../../../apps/server/src/shared/http/schema-json.ts). Web route screens live under [screens](../../../apps/web/src/features/settings/screens), while the [settings interface](../../../apps/web/src/features/settings/index.ts) exposes named screens and shell components. Settings read the provider-owned query client through `useQueryClient`; they do not import app composition. Preferences own theme, typography and desktop settings presentation; profile and security retain their separate account commands. API-key management is exposed in the same settings shell, with authorization owned by the API-key feature. Shared sidebar configuration accepts only schema version 3; missing or unsupported versions reset to the canonical layout instead of being migrated. Web settings presentation applies those preferences across navigation and page screens.

## Authorization and persistence

Preferences belong to the authenticated user. OAuth apps settings registers and deletes user-owned clients through Better Auth. Connected apps settings lists and deletes the user’s workspace consents; the OAuth provider checks persisted consent before issuing or refreshing tokens. Already-issued access tokens expire normally. Workspace and teamspace administration remain in their feature modules, even when the same settings shell displays them.

## Side effects, failures and recovery

Profile image changes use storage; preference changes invalidate the relevant client state. Preserve stored keys/defaults and distinguish user preferences from resource authorization.

## Verification and change points

Start with [the existing tests or model](../../../packages/features/src/user-settings) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
