import assert from "node:assert/strict"
import test from "node:test"

import {
  isAgentWorkspaceReadToolName,
  readAgentCitations,
  readAgentResultTable,
} from "./agent-contract"

test("workspace read tool names are explicit", () => {
  assert.equal(isAgentWorkspaceReadToolName("searchWorkspace"), true)
  assert.equal(isAgentWorkspaceReadToolName("sharePage"), false)
})

test("citation parsing keeps only safe normalized citations", () => {
  assert.deepEqual(
    readAgentCitations({
      citations: [
        {
          id: "page-1",
          source: "page",
          title: "Roadmap",
          url: "/p/page-1",
        },
        {
          id: "page-2",
          source: "page",
          title: "Unsafe",
          url: "javascript:alert(1)",
        },
        { id: "missing-fields" },
      ],
    }),
    [{
      id: "page-1",
      source: "page",
      title: "Roadmap",
      url: "/p/page-1",
    }],
  )
})

test("reads bounded typed tables and drops unknown cells", () => {
  assert.deepEqual(readAgentResultTable({
    data: {
      table: {
        columns: [{ id: "name", label: "Name", type: "text" }],
        rows: [{ cells: { name: "Ada", secret: "drop" }, id: "1", pageId: "p1" }],
      },
    },
  }), {
    columns: [{ id: "name", label: "Name", type: "text" }],
    rows: [{ cells: { name: "Ada" }, id: "1", pageId: "p1" }],
  })
})
