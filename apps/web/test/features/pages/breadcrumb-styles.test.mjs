export function register({ readSource, assert, test }) {
  test("breadcrumbs consistently use medium font weight", async () => {
    const source = await readSource("/src/components/ui/breadcrumb.tsx")

    assert.match(source, /breadcrumb-list[\s\S]*font-medium|font-medium[\s\S]*breadcrumb-list/)
    assert.match(source, /className=\{cn\("font-medium text-foreground"/)
    assert.doesNotMatch(source, /font-normal/)
  })
}
