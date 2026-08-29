export function register({ readSource, assert, test }) {
  test("kanban cards stay separated from tinted group columns", async () => {
    const styles = await readSource("/src/features/databases/styles/database.css")
    const cardRule = readRule(styles, ".database-kanban-card")
    const newCardRule = readRule(styles, ".database-kanban-new-card")

    assert.match(cardRule, /border-stroke-default/)
    assert.match(cardRule, /bg-surface-card/)
    assert.match(cardRule, /shadow-sm/)
    assert.match(newCardRule, /border-stroke-default/)
    assert.match(newCardRule, /bg-surface-card/)
    assert.match(newCardRule, /shadow-xs/)
    assert.doesNotMatch(
      styles,
      /\.database-kanban-column\[data-color-token\] \.database-kanban-card\s*\{/,
    )
  })
}

function readRule(styles, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const rule = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1]
  if (!rule) throw new Error(`Missing ${selector}`)
  return rule
}
