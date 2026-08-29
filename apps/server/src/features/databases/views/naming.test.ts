import assert from "node:assert/strict";
import { test } from "vitest";

import { getNextDatabaseViewName } from "./naming";

test("database view names trim input and fill the first numeric gap", () => {
  assert.equal(getNextDatabaseViewName(" Board ", new Set()), "Board");
  assert.equal(
    getNextDatabaseViewName(
      "Board",
      new Set(["Board", "Board 2", "Board 3"]),
    ),
    "Board 4",
  );
});

test("blank database view names use the Table fallback", () => {
  assert.equal(getNextDatabaseViewName(" ", new Set()), "Table");
  assert.equal(
    getNextDatabaseViewName("", new Set(["Table", "Table 2"])),
    "Table 3",
  );
});
