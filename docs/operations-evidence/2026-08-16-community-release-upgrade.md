# Community public-release upgrade

Date: 2026-08-16 05:45 UTC  
Operator: Codex GA handoff  
Scope: public tag `v0.0.31` to the current Community source tree

## Failure found

The previous public image recorded all 39 core migrations in Drizzle's legacy
`drizzle.__drizzle_migrations` journal. The current multi-edition migration
runner originally looked only at `drizzle.__zilobase_core_migrations`, treated
the database as empty, and failed on the existing `account` table. The failing
upgrade was reproduced locally before changing the migration runner.

## Repair and controls

- The migration runner now holds the session-level PostgreSQL advisory lock
  `hashtext('zilobase-database-migrations')` around journal adoption and every
  migration set.
- If and only if the new core journal is absent and the legacy journal exists,
  the legacy table is renamed to `__zilobase_core_migrations`. Existing or
  already-adopted databases are left unchanged.
- The previous-release test now follows the release's one-time bootstrap flow,
  signs in as that owner, creates a page, and retains the exact authenticated
  cookie through the image replacement.

## Verification

- Previous source: exact Git tag `v0.0.31`.
- Previous local image ID:
  `sha256:45ebb0c67f876aa6dc5c025e9543a5aca63ef72612e132ba2abda4125a8e796e`.
- Candidate local image ID:
  `sha256:6a08709471659bc0ba3db6b9ace715390d8f2726892950a02194f16b514350c9`.
- Both source trees contain 39 core journal entries.
- `migrations.test.ts`: 2 tests passed.
- Server TypeScript build passed.
- Exact-image Compose upgrade passed at 05:45 UTC with the final assertion:
  `Previous-release data and session survived the current migration.`

This evidence covers the migration compatibility portion of the Community
release gate. The clean Ubuntu/DNS/TLS/desktop/public-image requirements in GA
handoff 4.4 remain open.
