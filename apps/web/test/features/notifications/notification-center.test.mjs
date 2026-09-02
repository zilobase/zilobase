export function register({ assert, readSource, test }) {
  test("notification center polls and supports unread/read recovery", async () => {
    const center = await readSource("/src/features/notifications/notification-center.tsx")
    assert.match(center, /Mark all read/)
    assert.match(center, /notification\.readAt/)
    assert.match(center, /notification\.pageId/)
    assert.match(center, /useInProductNotifications/)
  })
}
