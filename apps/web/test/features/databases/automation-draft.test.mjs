export function register({ assert, loadModule, sourcePath, test }) {
  test('automation draft rules have no runtime React or presentation dependency', async () => {
    const { build } = await import('esbuild')
    const result = await build({ entryPoints: [sourcePath('/src/features/automations/definition/automation-draft.ts')], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true })
    assert.deepEqual(Object.keys(result.metafile.inputs).filter(path => /node_modules\/(react|react-dom)|\/shared\/(ui|components)\//.test(path)), [])
  })
  const draftPath = '/src/features/automations/definition/automation-draft.ts'
  const actionPath = '/src/features/automations/actions/notion-action-model.ts'
  test('automation drafts keep incomplete triggers unsavable and round-trip typed operands', async () => {
    const model = await loadModule(draftPath)
    const { createNotionActionDraft } = await loadModule(actionPath)
    const propertyCatalog = { properties: [{ id: 'property-1', operators: ['contains'], type: 'text' }] }
    assert.deepEqual(model.triggerFromSelection({ type: 'property_edited', propertyId: 'property-1' }, 'trigger-1', propertyCatalog), { id: 'trigger-1', type: 'property_edited', propertyId: 'property-1', operator: 'contains', operands: [] })
    assert.deepEqual(model.triggerFromSelection({ type: 'property_edited', propertyId: 'property-1', operator: 'is', operands: ['kept'] }, 'trigger-1', propertyCatalog).operands, ['kept'])
    assert.equal(model.triggerFromSelection({ type: 'property_edited', propertyId: 'any' }, 'trigger-1', propertyCatalog).operator, 'was_edited')
    const empty = model.emptyDraft()
    assert.deepEqual(empty.actions, [])
    assert.deepEqual(empty.triggers, [])
    assert.equal(model.buildDefinition(empty, 'UTC'), null)
    const action = createNotionActionDraft('edit_trigger_page', 'source-1')
    const draft = { ...empty, actions: [action], triggers: [{ id: 'trigger-1', type: 'property_edited', propertyId: 'property-1', operator: 'is_between', operands: ['2026-01-01'] }] }
    assert.equal(model.buildDefinition(draft, 'UTC'), null)
    const catalog = { properties: [{ id: 'property-1', type: 'date', name: 'Date' }] }
    const complete = { ...draft, scopeViewId: 'view-1', triggers: [{ ...draft.triggers[0], operands: ['2026-01-01', '2026-01-05'] }] }
    const definition = model.buildDefinition(complete, 'UTC', catalog)
    assert.deepEqual(definition.trigger.clauses[0].operand, { start: '2026-01-01T00:00:00.000Z', end: '2026-01-05T00:00:00.000Z', type: 'date_range' })
    const restored = model.draftFromDefinition('My automation', definition)
    assert.equal(restored.customName, true)
    assert.equal(restored.name, 'My automation')
    assert.deepEqual(model.buildDefinition(restored, 'UTC', catalog), definition)
    assert.deepEqual(model.nextTriggerOperands(complete.triggers[0], 'was_edited', 'date'), [])
    assert.deepEqual(model.nextTriggerOperands(complete.triggers[0], 'is_relative_to_today', 'date'), ['relative:this:week'])
  })

  test('automation drafts preserve schedule options, reordering identity and property literals', async () => {
    const model = await loadModule(draftPath)
    const { createNotionActionDraft } = await loadModule(actionPath)
    const { actionLiteralFromValues, actionValuesFromLiteral } = await loadModule('/src/features/automations/actions/property-action-model.ts')
    const draft = { ...model.emptyDraft(), triggerKind: 'schedule', actions: [createNotionActionDraft('add_page', 'source-1')] }
    draft.schedule = { ...draft.schedule, frequency: 'custom', customPattern: 'yearly', months: [2, 8], dayOfMonth: 'last', startDate: '2026-01-01', endDate: '2027-01-01' }
    const definition = model.buildDefinition(draft, 'Asia/Kolkata')
    assert.deepEqual(definition.trigger.schedule, { frequency: 'custom', interval: 1, localTime: '09:00', startDate: '2026-01-01', endDate: '2027-01-01', timezone: 'Asia/Kolkata', dayOfMonth: 'last', months: [2, 8] })
    assert.deepEqual(model.buildDefinition(model.draftFromDefinition('Scheduled', definition), 'Asia/Kolkata'), definition)
    const values = ['one', 'two']
    assert.deepEqual(actionValuesFromLiteral(actionLiteralFromValues(values, 'person'), 'person'), values)
    assert.equal(actionLiteralFromValues(['false'], 'checkbox'), false)
    assert.equal(actionLiteralFromValues(['7'], 'number'), 7)
    assert.equal(model.move(values, 0, -1), values)
    assert.deepEqual(model.move(values, 0, 1), ['two', 'one'])
    assert.deepEqual(values, ['one', 'two'])
  })
}
