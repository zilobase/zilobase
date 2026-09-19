// Deprecated: canonical implementation now lives in `@zilobase/runtime-adapter/node`.
// Kept for one release for compatibility; new code should import from the adapter package.
export {
  assertMigrationSets,
  runMigrationSets,
  type MigrationSet,
} from "@zilobase/runtime-adapter/node";
export { CORE_MIGRATION_SET } from "../../public/node-adapter-api";
