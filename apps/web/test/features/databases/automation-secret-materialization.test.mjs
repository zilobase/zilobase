export function register({ assert, loadModule, test }) {
  test('automation secrets materialize in order without mutating the editing draft', async () => {
    const { materializeWebhookSecrets } = await loadModule('/src/features/automations/definition/materialize-webhook-secrets.ts')
    const { emptyDraft, buildDefinition } = await loadModule('/src/features/automations/definition/automation-draft.ts')
    const { createNotionActionDraft } = await loadModule('/src/features/automations/actions/notion-action-model.ts')
    const action = createNotionActionDraft('send_webhook', 'source-1')
    action.webhookHeaders = [
      { key: 'a', name: 'Authorization', secretId: '', value: 'first' },
      { key: 'empty', name: ' ', secretId: '', value: 'ignored' },
      { key: 'b', name: 'X-Token', secretId: '', value: 'second' },
    ]
    const draft = { ...emptyDraft(), actions: [action], triggers: [{ id: 'trigger', type: 'page_added', propertyId: 'any', operator: 'was_edited', operands: [] }] }
    const snapshot = JSON.stringify(draft)
    const calls = []
    const saved = await materializeWebhookSecrets(draft, async input => {
      calls.push(input)
      return { id: `secret-${calls.length}` }
    })
    assert.deepEqual(calls, [{ purpose: 'webhook_header', value: 'first' }, { purpose: 'webhook_header', value: 'second' }])
    assert.equal(JSON.stringify(draft), snapshot)
    assert.deepEqual(buildDefinition(saved, 'UTC').actions[0].headers, [{ name: 'Authorization', secretId: 'secret-1' }, { name: 'X-Token', secretId: 'secret-2' }])
    const persisted = { ...draft, actions: saved.actions.map(item => ({ ...item, webhookHeaders: item.webhookHeaders.filter(header => header.name.trim()) })) }
    assert.equal(await materializeWebhookSecrets(persisted, () => { throw new Error('must reuse existing secrets') }), persisted)
    await assert.rejects(materializeWebhookSecrets(draft, async () => { throw new Error('secret unavailable') }), /secret unavailable/)
    assert.equal(JSON.stringify(draft), snapshot)
  })
}
