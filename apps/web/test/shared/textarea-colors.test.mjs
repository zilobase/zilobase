export function register({ readSource, assert, test }) {
  test("form surfaces use the same accent color as sidebar hover states", async () => {
    const textareaSource = await readSource("/src/components/ui/textarea.tsx")
    const promptInputSource = await readSource("/src/components/ai-elements/prompt-input.tsx")
    const selectSource = await readSource("/src/components/ui/select.tsx")

    assert.match(textareaSource, /border-input bg-accent/)
    assert.doesNotMatch(textareaSource, /border-input bg-input/)
    assert.match(promptInputSource, /overflow-hidden bg-accent dark:bg-accent/)
    assert.match(selectSource, /border-input bg-accent/)
    assert.doesNotMatch(selectSource, /border-input bg-input/)
  })
}
