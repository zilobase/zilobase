export function register({ assert, readSource, test }) {
  test("sidebar primitives expose only the supported Zilobase layout", async () => {
    const source = await readSource("/src/shared/ui/sidebar.tsx")

    for (const removedComponent of [
      "SidebarInput",
      "SidebarMenuSkeleton",
      "SidebarMenuSub",
      "SidebarRail",
      "SidebarSeparator",
    ]) {
      assert.doesNotMatch(source, new RegExp(`function ${removedComponent}\\b`))
    }

    assert.doesNotMatch(source, /side\?: "left" \| "right"/)
    assert.doesNotMatch(source, /variant\?: "sidebar"/)
    assert.doesNotMatch(source, /collapsible\?:/)
    assert.doesNotMatch(source, /sidebar_state|document\.cookie/)
    assert.doesNotMatch(source, /class-variance-authority|Tooltip/)

    assert.match(source, /width\?: React\.CSSProperties\["width"\]/)
    assert.match(source, /mobileWidth\?: React\.CSSProperties\["width"\]/)
    assert.match(source, /actions\?: React\.ReactNode/)
    assert.match(source, /navigation\?: React\.ReactNode/)
    assert.match(source, /<Sheet open=\{openMobile\} onOpenChange=\{setOpenMobile\}>/)
    assert.match(source, /side="left"/)
    assert.match(source, /!open && "w-0"/)
    assert.match(source, /!open && "-translate-x-full"/)
  })
}
