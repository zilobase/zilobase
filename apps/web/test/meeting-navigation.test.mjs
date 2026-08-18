import { readFile } from "node:fs/promises"

export function register({ assert, loadModule, test }) {
  test("meeting navigation resolves full-page and inline meeting routes", async () => {
    const { getActiveMeetingId } = await loadModule(
      "/src/components/sidebar-nav-list.tsx",
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
      "/src/lib/meeting-navigation.ts",
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

  test("meeting sidebar links target host pages without an index route", async () => {
    const [navigationSource, routerSource] = await Promise.all([
      readFile(
        new URL("../src/components/nav-meetings.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/router.tsx", import.meta.url), "utf8"),
    ])

    assert.match(navigationSource, /to="\/p\/\$pageId"/)
    assert.match(navigationSource, /search=\{\{ meeting: meeting\.id \}\}/)
    assert.doesNotMatch(navigationSource, /to="\/m\/\$meetingId"/)
    assert.doesNotMatch(routerSource, /path: "\/meetings"/)
  })
}
