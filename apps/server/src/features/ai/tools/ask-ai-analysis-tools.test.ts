import assert from "node:assert/strict";
import { test } from "vitest";

import { analyzeDataTable } from "./ask-ai-analysis-tools";

test("runs deterministic grouped calculations", () => {
  const result = analyzeDataTable({
    operation: { aggregate: "sum", groupBy: "Team", kind: "group", valueColumn: "Hours" },
    table: {
      columns: ["Team", "Hours"],
      rows: [["A", 2], ["A", 3], ["B", 4]],
    },
  });
  assert.deepEqual(result.data?.table.rows.map((row) => row.cells), [
    { group: "A", value: "5" },
    { group: "B", value: "4" },
  ]);
});
