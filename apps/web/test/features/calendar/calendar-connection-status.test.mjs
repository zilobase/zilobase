export function register({ assert, readSource, test }) {
  test("calendar connection results open in a setup dialog", async () => {
    const source = await readSource(
      "/src/features/calendar/connections/calendar-connection-status.tsx",
    )

    assert.match(source, /<Dialog[\s\S]*?open/)
    assert.match(source, /<DialogTitle>/)
    assert.match(source, /<DialogDescription>/)
    assert.match(source, /<DialogFooter>/)
    assert.doesNotMatch(source, /<section[^>]*Calendar connection result/)
  })
}
