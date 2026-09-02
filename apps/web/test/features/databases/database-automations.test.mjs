export function register({ assert, readSource, test }) {
  test("database automation release is server-capability gated and source scoped", async () => {
    const [manager, toolbar] = await Promise.all([
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      ),
      readSource("/src/features/databases/views/view/database-view-toolbar.tsx")
    ])
    assert.match(toolbar, /useDatabaseAutomationCapability/)
    assert.match(toolbar, /activeViewTab\?\.dataSourceId/)
    assert.match(toolbar, /automationsEnabled/)
    assert.match(manager, /useDatabaseAutomations\(databaseId, dataSourceId\)/)
  })

  test("automation manager includes builder, lifecycle, history, and discard flows", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx"
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
      "Resume"
    ])
      assert.match(manager, new RegExp(behavior.replace("?", "\\?")))
    assert.match(manager, /className="w-72/)
    assert.match(manager, /max-h-\[min\(680px,calc\(100dvh-3rem\)\)\]/)
  })

  test("new automations start empty and use matching add trigger and action cards", async () => {
    const manager = await readSource(
      "/src/features/databases/automations/database-automation-manager.tsx"
    )

    assert.match(manager, /function emptyDraft\(\)[\s\S]*?actions: \[\][\s\S]*?triggers: \[\]/)
    assert.match(manager, /label="Add trigger"/)
    assert.doesNotMatch(manager, /label="New trigger"/)
    assert.match(manager, /function ActionPicker/)
    assert.equal(
      [...manager.matchAll(/h-10 w-full justify-start border-stroke-default px-3 text-sm/g)].length,
      2
    )
    assert.match(manager, /if \(draft\.actions\.length === 0\) return null/)
    assert.match(manager, /draft\.triggerKind === "event" && draft\.triggers\.length === 0/)
  })

  test("automation manager uses the View settings dropdown pattern and opens the builder in a dialog", async () => {
    const [manager, actions] = await Promise.all([
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      ),
      readSource(
        "/src/features/databases/automations/notion-action-builder.tsx"
      )
    ])

    assert.match(manager, /<DropDrawer[\s\S]*?defaultSubDisplayMode="inline"/)
    assert.match(manager, /<DropDrawerContent[\s\S]*?className="w-72/)
    assert.match(
      manager,
      /<DropDrawerItem className="font-medium" onSelect=\{onCreate\}/
    )
    assert.match(manager, /<Dialog[\s\S]*?open=\{screen === "builder"\}/)
    assert.match(manager, /<DialogContent[\s\S]*?bg-surface-overlay/)
    assert.match(
      manager,
      /shrink-0 font-medium text-content-secondary">For pages in/
    )
    assert.match(
      manager,
      /ariaLabel="Automation scope"[\s\S]*?className="min-w-0 flex-1 text-content-primary"/
    )
    assert.doesNotMatch(manager, />Active<\/span>/)
    assert.match(manager, />When</)
    assert.match(manager, />Do</)
    assert.doesNotMatch(
      manager,
      /aria-label=\{`\$\{expanded \? "Collapse" : "Expand"\} trigger/
    )
    assert.match(manager, /group\/trigger flex min-h-10 items-center/)
    assert.match(manager, /step === "root"/)
    assert.match(manager, /step === "operator"/)
    assert.match(manager, /step === "value"/)
    assert.match(manager, /function TriggerConfigurationValueStep/)
    assert.match(manager, /label="Any option"/)
    assert.match(manager, /const effectiveOperands = anyOption \? allOptionIds : trigger\.operands/)
    assert.match(manager, /operands: checked \? allOptionIds : \[\]/)
    assert.match(manager, /checked=\{selected\.has\(option\.id\)\}/)
    assert.match(manager, /const propertyBadge = \(/)
    assert.match(manager, /propertyBadge[\s\S]*?bg-surface-subtle[\s\S]*?<AutomationPropertyIcon property=\{property\}/)
    assert.match(manager, /propertyId !== "any"\) return null/)
    assert.match(manager, /getColorTokenBadgeClassName\(option\.color\)/)
    assert.match(manager, /operands: selection\.operands \?\? \[\]/)
    assert.match(manager, /operator: selection\.operator \?\? \(selection\.propertyId/)
    assert.match(manager, /function ActionPropertyValueStep/)
    assert.match(manager, /heading="Edit property"/)
    assert.match(manager, /Set \{propertyConfiguration\.property\.name\} to/)
    assert.match(manager, /function CompactPropertyActionCard/)
    assert.match(
      actions,
      /aria-label=\{`\$\{expanded \? "Collapse" : "Expand"\} action/
    )
    assert.match(
      manager,
      /rounded-lg border border-stroke-default bg-surface-overlay/
    )
    assert.match(
      actions,
      /rounded-lg border border-stroke-default bg-surface-overlay/
    )
    assert.match(manager, /placeholder="Search triggers…"/)
    assert.match(manager, /const automationMenuItemClassName = "min-h-9 px-2 py-2 text-\[13px\]"/)
    assert.equal([...manager.matchAll(/<PopoverContent align="start" className="w-72 gap-0 p-0">/g)].length, 2)
    assert.match(manager, /className="order-last -rotate-90 text-content-secondary"/)
    assert.match(manager, /data-checked=\{selection\?\.action\.type === type\}/)
    assert.match(
      manager,
      /function TriggerPicker[\s\S]*?<Popover modal open=\{open\}/
    )
    assert.match(manager, /onWheelCapture=\{\(event\) => event\.stopPropagation\(\)\}/)
    assert.match(manager, /touch-pan-y overscroll-contain/)
    assert.match(manager, /heading="Event"/)
    assert.match(manager, /heading="Property edited"/)
    assert.match(manager, /function AutomationPropertyIcon/)
    assert.match(manager, /getDatabasePropertyType\(property\.type\)\.icon/)
    assert.match(manager, /<PageIconDisplay size="sm" value=\{property\.icon\}/)
    assert.match(
      manager,
      /<AutomationPropertyIcon property=\{property\} \/>[\s\S]*?<span className="min-w-0 flex-1 truncate">\{property\.name\}/
    )
    assert.match(manager, /Any property edited/)
    assert.match(manager, /Page added/)
    assert.match(manager, /Every…/)
    assert.match(
      manager,
      /function TriggerCard[\s\S]*?>When<\/span>[\s\S]*?<TriggerPicker/
    )
    assert.match(manager, /<DatabaseConditionValueControl/)
    assert.match(manager, /property\.type === "person"/)
    assert.match(manager, /property\.options\.map/)
    assert.match(manager, /triggerOperandValues\(clause\.operand\)/)
    assert.match(manager, /When any of these occur/)
    assert.match(manager, /When all of these occur/)
    assert.match(manager, /ariaLabel="How event triggers are combined"[\s\S]*?className="w-full text-xs"/)
    assert.match(manager, /broadEditedTriggerCount > 1/)
    assert.match(manager, /within about three seconds/)
    assert.doesNotMatch(manager, /Any trigger|All triggers|>Run when</)
    assert.doesNotMatch(manager, /ariaLabel="Automation trigger type"/)
    assert.doesNotMatch(manager, />Trigger \{index \+ 1\}</)
    assert.doesNotMatch(actions, />Action \{index \+ 1\}</)
    assert.match(manager, /New automation/)
    assert.match(manager, /Close automation editor/)
    assert.match(manager, /onOpenAutoFocus=\{\(event\) => event\.preventDefault\(\)\}/)
    assert.match(actions, /grid min-w-0 grid-cols-2 gap-1\.5/)
    assert.match(actions, /className="w-full data-\[size=default\]:h-8" ariaLabel=\{`Property/)
    assert.doesNotMatch(manager, /useIsMobile\(\)/)
  })

  test("enabled command options do not inherit the disabled cursor", async () => {
    const globalStyles = await readSource("/src/shared/styles/global.css")

    assert.match(globalStyles, /\[data-disabled="true"\]/)
    assert.match(globalStyles, /\[data-disabled=""\]/)
    assert.doesNotMatch(globalStyles, /\[data-disabled\]\) \{\n  cursor: not-allowed/)
  })

  test("data-source settings launches the shared automation manager", async () => {
    const settings = await readSource(
      "/src/features/databases/views/view-settings/view/data-source-settings.tsx"
    )
    assert.match(settings, /onOpenAutomations/)
    assert.doesNotMatch(settings, /Automation settings/)
  })

  test("builder supports recurring schedules and excludes trigger-page actions", async () => {
    const [manager, actions] = await Promise.all([
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      ),
      readSource(
        "/src/features/databases/automations/notion-action-builder.tsx"
      )
    ])
    for (const behavior of [
      "Every…",
      "Schedule frequency",
      "Custom schedule unit",
      "Schedule local time",
      "Schedule start date",
      "Schedule end date",
      "Last day"
    ])
      assert.match(manager, new RegExp(behavior))
    assert.match(actions, /!\(scheduled && type === "edit_trigger_page"\)/)
    assert.match(manager, /<TimePicker aria-label="Schedule local time"/)
    assert.match(manager, /<DatePicker aria-label="Schedule start date"/)
    assert.match(manager, /<DatePicker aria-label="Schedule end date"/)
    assert.doesNotMatch(manager, /type="(?:date|number|time)"/)
  })

  test("shared filter and automation calendars keep range selection visible until it is complete", async () => {
    const conditionEditor = await readSource(
      "/src/features/databases/views/view/database-condition-editor.tsx"
    )

    assert.match(conditionEditor, /const rangeStartPending = Boolean/)
    assert.match(
      conditionEditor,
      /flushSync\(\(\) => onValuesChange\(\[toDateOnlyValue\(date\)\]\)\)/
    )
    assert.match(conditionEditor, /onComplete\(\)/)
    assert.match(
      conditionEditor,
      /<Popover modal open=\{datePopoverOpen\} onOpenChange=\{setDatePopoverOpen\}>/
    )
    assert.match(
      conditionEditor,
      /onPointerDownCapture=\{selectDateFromPointer\}/
    )
    assert.match(
      conditionEditor,
      /mode="single"[\s\S]*?onDayClick=\{selectDateFromClick\}/
    )
    assert.match(
      conditionEditor,
      /onPointerDownCapture=\{selectDateRangeFromPointer\}/
    )
  })

  test("filters and automation triggers share checkbox option selection", async () => {
    const [conditionEditor, manager] = await Promise.all([
      readSource(
        "/src/features/databases/views/view/database-condition-editor.tsx"
      ),
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      )
    ])

    assert.match(
      conditionEditor,
      /function DatabaseChoiceConditionValueControl/
    )
    assert.match(
      conditionEditor,
      /import \{ Checkbox \} from "@\/shared\/ui\/checkbox"/
    )
    assert.match(
      conditionEditor,
      /\["multi_select", "person", "select", "status"\]/
    )
    assert.match(conditionEditor, /<Checkbox/)
    assert.match(
      conditionEditor,
      /getColorTokenBadgeClassName\(option\.color\)/
    )
    assert.match(manager, /type: "entity_list"/)
    assert.match(
      manager,
      /if \(operand\.type === "entity_list"\) return operand\.ids/
    )
  })

  test("builder uses Notion's exact action names and ordering", async () => {
    const actions = await readSource(
      "/src/features/databases/automations/notion-action-builder.tsx"
    )
    const labels = [
      "Edit property",
      "Add page to",
      "Edit pages in",
      "Send notification to",
      "Send mail to",
      "Send webhook",
      "Send Slack notification to",
      "Define variables"
    ]
    let previous = -1
    for (const label of labels) {
      const next = actions.indexOf(`label: "${label}"`)
      assert.ok(next > previous, `${label} must appear in Notion order`)
      previous = next
    }
  })

  test("automation builder uses the shared select component for every dropdown", async () => {
    const [manager, actions] = await Promise.all([
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      ),
      readSource(
        "/src/features/databases/automations/notion-action-builder.tsx"
      )
    ])
    const source = `${manager}\n${actions}`

    assert.match(source, /from "@\/shared\/ui\/select"/)
    assert.match(source, /<SelectTrigger/)
    assert.match(source, /<SelectContent/)
    assert.match(source, /<SelectItem/)
    assert.doesNotMatch(source, /<select\b/)
    assert.doesNotMatch(source, /<option\b/)
  })

  test("builder exposes bounded in-product notification recipients", async () => {
    const actions = await readSource(
      "/src/features/databases/automations/notion-action-builder.tsx"
    )
    for (const behavior of [
      "Send notification to",
      "Notification recipient",
      "Notification message",
      "Add recipient"
    ]) {
      assert.match(actions, new RegExp(behavior))
    }
    assert.match(actions, /recipients\.length >= 20/)
    assert.match(actions, /catalog\?\.users/)
  })

  test("builder exposes protected Gmail fields and dynamic recipient sources", async () => {
    const actions = await readSource(
      "/src/features/databases/automations/notion-action-builder.tsx"
    )
    for (const behavior of [
      "Send mail to",
      "Send mail from",
      "Add To recipient",
      "Add CC recipient",
      "Add BCC recipient",
      "Email subject",
      "Email message",
      "Send with display name",
      "Send replies to"
    ])
      assert.match(actions, new RegExp(behavior))
    assert.match(actions, /selected_person/)
    assert.match(actions, /trigger_property/)
    assert.match(actions, /page_creator/)
  })

  test("builder stores webhook headers separately from definitions", async () => {
    const [manager, actions] = await Promise.all([
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      ),
      readSource(
        "/src/features/databases/automations/notion-action-builder.tsx"
      )
    ])
    for (const behavior of [
      "Send webhook",
      "Webhook URL",
      "Properties for webhook content",
      "Add custom header",
      "Stored secret"
    ])
      assert.match(actions, new RegExp(behavior))
    assert.match(manager, /useCreateDatabaseAutomationSecret/)
    assert.match(actions, /webhookHeaders/)
    assert.doesNotMatch(actions, /headers:.*header\.value/)
  })

  test("builder discovers Slack channels and exposes variables, mentions, and links", async () => {
    const actions = await readSource(
      "/src/features/databases/automations/notion-action-builder.tsx"
    )
    assert.match(actions, /useSlackAutomationChannels/)
    assert.match(actions, /Slack mention/)
    assert.match(actions, /Slack link/)
    assert.match(actions, /allowFormula=\{false\}/)
    for (const behavior of [
      "Bold",
      "Italic",
      "@channel / @here",
      "slack_broadcast"
    ]) {
      assert.match(actions, new RegExp(behavior))
    }
  })

  test("actions expose Notion's multi-value and nested editing controls", async () => {
    const actions = await readSource(
      "/src/features/databases/automations/notion-action-builder.tsx"
    )
    for (const behavior of [
      "Edit another property",
      "Add variable",
      "Add recipient",
      "Add condition group",
      "Add custom header",
      "Select database"
    ])
      assert.match(actions, new RegExp(behavior))
    assert.match(actions, /action\.type === "add_page" \? "min-w-0 flex-1" : "w-fit"/)
    assert.match(actions, /action\.type === "add_page" \? \([\s\S]*?<DataSourceSelect[\s\S]*?className="min-w-0 flex-1"/)
    assert.match(actions, /type === "add_page"[\s\S]*?operations: \[\]/)
    assert.match(actions, /operations\.length \? "Edit another property" : "Edit property"/)
  })

  test("editing existing actions keeps the complete runtime definition", async () => {
    const [manager, actions] = await Promise.all([
      readSource(
        "/src/features/databases/automations/database-automation-manager.tsx"
      ),
      readSource(
        "/src/features/databases/automations/notion-action-builder.tsx"
      )
    ])
    assert.match(
      actions,
      /export function notionActionDraftFromAction[\s\S]*?action,/
    )
    assert.match(
      actions,
      /if \(draft\.action\.type !== "send_webhook"\) return draft\.action/
    )
    assert.match(
      manager,
      /definition\.actions\.map\(notionActionDraftFromAction\)/
    )
    assert.match(manager, /draft\.actions\.map\(actionForDefinition\)/)
    assert.doesNotMatch(
      manager,
      /LegacyActionCard|legacy projection|\bActionDraft\b/
    )
  })
}
