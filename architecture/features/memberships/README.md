# Memberships

## Owning modules and interface

- [apps/server/src/features/memberships](../../../apps/server/src/features/memberships)

## Main flow

[Membership grants](../../../apps/server/src/features/memberships/membership-grants.ts) implements the existing MembershipService interface, including transactional creation, concurrent-grant recovery, edition integration and default teamspace membership. The temporary-membership module supplies active membership conditions and expiry behavior reused by access and guest workflows. Contributor-facing membership administration is owned by the [workspace member commands and presentation](../workspaces/README.md), including invitation deadlines and owner-editing restrictions; teamspace principals remain a distinct capability.

## Authorization and persistence

Membership records associate users with workspaces and roles. Callers must distinguish active membership from a row that exists but has expired. Database transactions can supply the concrete database dependency.

Edition integrations use the published persistence port for typed membership
counts and membership reads. Core retains the table mapping and SQL; external
packages supply only the opaque database handle received from extension hooks.

## Side effects, failures and recovery

Grants, revocations and expiry affect downstream access. Keep edition callbacks and temporary membership transitions in the owning module rather than copying membership writes into callers.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/memberships/membership-grants.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
