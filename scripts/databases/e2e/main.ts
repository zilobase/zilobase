import { mountRecordDrops } from "../../../apps/web/test/support/fixtures/database-kanban-moves";
import { mountQueryReconciliation } from "../../../apps/web/test/support/fixtures/database-query-reconciliation";
import { DemoDatabaseRuntime } from "../../../apps/web/src/features/demo/database-runtime";
import { demoDatabaseFixture } from "../../../apps/web/test/support/demo-database-fixture";

Object.assign(window, {
  board: mountRecordDrops(document.getElementById("board")!),
  queries: mountQueryReconciliation(document.getElementById("queries")!),
  DemoDatabaseRuntime,
  demoDatabaseFixture,
});
