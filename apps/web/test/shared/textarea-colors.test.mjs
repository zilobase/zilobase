export function register({ readSource, assert, test }) {
  test("form surfaces use the control background role", async () => {
    const inputSource = await readSource("/src/shared/ui/input.tsx")
    const textareaSource = await readSource("/src/shared/ui/textarea.tsx")
    const promptInputSource = await readSource("/src/features/ai/components/elements/prompt-input.tsx")
    const selectSource = await readSource("/src/shared/ui/select.tsx")

    assert.match(inputSource, /h-8 .*border-control-border bg-control-background/)
    assert.match(textareaSource, /border-control-border bg-control-background/)
    assert.match(promptInputSource, /overflow-hidden bg-control-background/)
    assert.match(selectSource, /border-control-border bg-control-background/)
    assert.doesNotMatch(`${inputSource}${textareaSource}${selectSource}`, /dark:bg-/)
  })
}
