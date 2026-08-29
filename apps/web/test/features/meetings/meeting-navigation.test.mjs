export function register({ readSource, assert, loadModule, test }) {
  test("meeting navigation resolves full-page and inline meeting routes", async () => {
    const { getActiveMeetingId } = await loadModule(
      "/src/features/sidebar/components/sidebar-nav-list.tsx",
    )

    assert.equal(getActiveMeetingId("/m/meeting-1"), "meeting-1")
    assert.equal(
      getActiveMeetingId("/p/page-1", { meeting: "meeting-2" }),
      "meeting-2",
    )
    assert.equal(
      getActiveMeetingId("/p/page-1", "meeting=meeting-3"),
      "meeting-3",
    )
  })

  test("meeting block lookup matches the exact rendered meeting", async () => {
    const { findMeetingBlock, scrollToMeetingBlock } = await loadModule(
      "/src/features/meetings/model/meeting-navigation.ts",
    )
    const first = { dataset: { meetingId: "meeting-1" } }
    const calls = []
    const second = {
      dataset: { meetingId: "meeting-2" },
      scrollIntoView: (options) => calls.push(options),
    }
    const root = { querySelectorAll: () => [first, second] }

    assert.equal(findMeetingBlock(root, "meeting-2"), second)
    assert.equal(findMeetingBlock(root, "missing"), null)
    assert.equal(scrollToMeetingBlock(root, "meeting-2"), true)
    assert.deepEqual(calls, [{ behavior: "smooth", block: "center" }])
  })

  test("meeting sidebar links target full meeting pages", async () => {
    const [
      navigationSource,
      sidebarSource,
      meetingPageSource,
      meetingViewSource,
      routerSource,
    ] = await Promise.all([
        readSource("/src/features/sidebar/components/nav-meetings.tsx"),
        readSource("/src/features/sidebar/components/sidebar-nav-list.tsx"),
        readSource("/src/features/meetings/pages/meeting.tsx"),
        readSource("/src/features/editor/extensions/meeting/meeting-view.tsx"),
        readSource("/src/app/routing/route-groups/content-routes.tsx"),
      ])

    assert.match(navigationSource, /to="\/m\/\$meetingId"/)
    assert.match(sidebarSource, /to="\/m\/\$meetingId"/)
    assert.doesNotMatch(navigationSource, /to="\/p\/\$pageId"/)
    assert.match(meetingPageSource, /embeddedPage=\{\{/)
    assert.match(meetingViewSource, /PageIconDisplay size="sm"/)
    assert.match(meetingViewSource, /ArrowUpRightIcon className=/)
    assert.match(meetingViewSource, /search=\{\{ meeting: meetingId \}\}/)
    assert.match(meetingViewSource, /to="\/p\/\$pageId"/)
    assert.doesNotMatch(meetingViewSource, /Embedded in/)
    assert.doesNotMatch(routerSource, /path: "\/meetings"/)
  })
}
