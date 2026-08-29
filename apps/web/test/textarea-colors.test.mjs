import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("form surfaces use the same accent color as sidebar hover states", async () => {
    const textareaSource = await readFile(
      new URL("../src/components/ui/textarea.tsx", import.meta.url),
      "utf8",
    )
    const promptInputSource = await readFile(
      new URL("../src/components/ai-elements/prompt-input.tsx", import.meta.url),
      "utf8",
    )
    const selectSource = await readFile(
      new URL("../src/components/ui/select.tsx", import.meta.url),
      "utf8",
    )

    assert.match(textareaSource, /border-input bg-accent/)
    assert.doesNotMatch(textareaSource, /border-input bg-input/)
    assert.match(promptInputSource, /overflow-hidden bg-accent dark:bg-accent/)
    assert.match(selectSource, /border-input bg-accent/)
    assert.doesNotMatch(selectSource, /border-input bg-input/)
  })
}
