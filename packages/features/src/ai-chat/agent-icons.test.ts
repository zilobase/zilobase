import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildAgentGlyphSvg,
  buildAgentIconSvg,
  resolveAgentGlyphName,
  resolveAgentIconSpec,
} from "./agent-icons"

test("agent icons use deterministic semantic fallbacks", () => {
  assert.deepEqual(resolveAgentIconSpec({
    fallbackKind: "database",
    name: "Release Tracker",
  }), { color: "orange", name: "rocket" })
  assert.deepEqual(resolveAgentIconSpec({
    fallbackKind: "page",
    name: "Untitled page",
  }), { color: "gray", name: "file" })
})

test("property and view glyphs use native-type fallbacks without colors", () => {
  assert.equal(resolveAgentGlyphName({
    fallbackKind: "property",
    name: "Due date",
    type: "date",
  }), "calendar")
  assert.equal(resolveAgentGlyphName({
    fallbackKind: "view",
    name: "Board",
    type: "kanban",
  }), "kanban")
  assert.equal(resolveAgentGlyphName({
    fallbackKind: "property",
    name: "Destination",
    type: "place",
  }), "place")

  const svg = buildAgentGlyphSvg("place")
  assert.match(svg, /data-icon-library="phosphor"/)
  assert.doesNotMatch(svg, /data-icon-color=/)
})

test("explicit validated icon choices win and render sanitized stored SVG", () => {
  const requested = { color: "pink" as const, name: "target" as const }
  const resolved = resolveAgentIconSpec({
    fallbackKind: "database",
    name: "Release Tracker",
    requested,
  })
  const svg = buildAgentIconSvg(resolved)

  assert.deepEqual(resolved, requested)
  assert.match(svg, /^<svg /)
  assert.match(svg, /data-icon-color="pink"/)
  assert.match(svg, /data-icon-library="phosphor"/)
  assert.doesNotMatch(svg, /<script|onload=|javascript:/i)
})
