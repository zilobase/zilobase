export function register({ assert, readSource, test }) {
  test("database automation release is server-capability gated and source scoped", async () => {
    const [manager, toolbar] = await Promise.all([
      readSource("/src/features/databases/automations/database-automation-manager.tsx"),
      readSource("/src/features/databases/views/view/database-view-toolbar.tsx"),
    ])
    assert.match(toolbar, /useDatabaseAutomationCapability/)
    assert.match(toolbar, /activeViewTab\?\.dataSourceId/)
    assert.match(toolbar, /automationsEnabled/)
    assert.match(manager, /useDatabaseAutomations\(databaseId, dataSourceId\)/)
  })

  test("automation manager includes builder, lifecycle, history, and discard flows", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    for (const behavior of [
      "Create and activate",
      "Discard automation changes?",
      "Add trigger",
      "Add action",
      "Recent runs",
      "Run details",
      "Duplicate automation",
      "Pause",
      "Resume",
    ]) assert.match(manager, new RegExp(behavior.replace("?", "\\?")))
    assert.match(manager, /w-\[min\(448px,var\(--radix-popover-content-available-width\)\)\]/)
    assert.match(manager, /h-\[calc\(100dvh-1rem\)\]/)
  })

  test("automation manager uses an anchored popover on desktop and a drawer on mobile", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )

    assert.match(manager, /useIsMobile\(\)/)
    assert.match(manager, /<Popover modal open=\{open\}/)
    assert.match(manager, /<PopoverContent[\s\S]*?side="left"/)
    assert.match(manager, /--radix-popover-content-available-height/)
    assert.match(manager, /--radix-popover-content-available-width/)
    assert.match(manager, /avoidCollisions/)
    assert.match(manager, /sticky="always"/)
    assert.match(manager, /isMobile \? \([\s\S]*?<DropDrawer/)
  })

  test("data-source settings launches the shared automation manager", async () => {
    const settings = await readSource(
      "/src/features/databases/views/view-settings/view/data-source-settings.tsx",
    )
    assert.match(settings, /onOpenAutomations/)
    assert.doesNotMatch(settings, /Automation settings/)
  })

  test("builder supports recurring schedules and excludes trigger-page actions", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    for (const behavior of [
      "On a schedule",
      "Schedule frequency",
      "Custom schedule unit",
      "Schedule local time",
      "Schedule start date",
      "Schedule end date",
      "Last day",
    ]) assert.match(manager, new RegExp(behavior))
    assert.match(manager, /!scheduled \? \[\{ label: "Edit trigger page", value: "edit_trigger_page" \}\]/)
  })

  test("automation builder uses the shared select component for every dropdown", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )

    assert.match(manager, /from "@\/shared\/ui\/select"/)
    assert.match(manager, /<SelectTrigger/)
    assert.match(manager, /<SelectContent/)
    assert.match(manager, /<SelectItem/)
    assert.doesNotMatch(manager, /<select\b/)
    assert.doesNotMatch(manager, /<option\b/)
  })

  test("builder exposes bounded in-product notification recipients", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    for (const behavior of ["Send notification", "Notification recipient type", "Notification recipient", "Notification message"]) {
      assert.match(manager, new RegExp(behavior))
    }
    assert.match(manager, /catalog\?\.users/)
  })

  test("builder exposes protected Gmail fields and dynamic recipient sources", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    for (const behavior of [
      "Send Gmail",
      "Gmail connection",
      "Gmail recipient type",
      "Gmail subject",
      "Gmail message",
      "Gmail sender name",
      "Gmail reply-to",
    ]) assert.match(manager, new RegExp(behavior))
    assert.match(manager, /selected_person/)
    assert.match(manager, /trigger_property/)
    assert.match(manager, /page_creator/)
  })

  test("builder stores webhook headers separately from definitions", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    for (const behavior of [
      "Send webhook",
      "Webhook URL",
      "Webhook selected property",
      "Webhook payload field",
      "Webhook header name",
      "Webhook header value",
      "Stored secret",
    ]) assert.match(manager, new RegExp(behavior))
    assert.match(manager, /useCreateDatabaseAutomationSecret/)
    assert.doesNotMatch(manager, /headers:.*webhookHeaderValue/)
  })

  test("builder discovers Slack channels and exposes variables, mentions, and links", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx",
    )
    assert.match(manager, /useStartSlackAutomationOauth/)
    assert.match(manager, /useSlackAutomationChannels/)
    assert.match(manager, /Slack mention ID/)
    assert.match(manager, /Slack link URL/)
    assert.match(manager, /reference: "variable"/)
  })
}
