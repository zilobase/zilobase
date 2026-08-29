export function register({ readSource, assert, test }) {
  test("breadcrumbs consistently use medium font weight", async () => {
    const source = await readSource("/src/shared/ui/breadcrumb.tsx")

    assert.match(source, /breadcrumb-list[\s\S]*font-medium|font-medium[\s\S]*breadcrumb-list/)
    assert.match(source, /className=\{cn\("font-medium text-content-primary"/)
    assert.doesNotMatch(source, /font-normal/)
  })
}
