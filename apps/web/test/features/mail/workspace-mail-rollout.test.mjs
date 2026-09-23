import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, readSource, readWorkspace, test }) {
  test("workspace mail organization is the only enabled Mail experience", async () => {
    const [flags, page, sidebar, apiPath, realtime] = await Promise.all([
      readSource("/src/shared/config/feature-flags.ts"),
      readMailFeatureSource(readSource),
      readSource("/src/features/sidebar/app-sidebar.tsx"),
      readWorkspace("/packages/features/src/mail/queries.ts"),
      readSource("/src/features/mail/realtime/mail-realtime.ts"),
    ])
    assert.doesNotMatch(flags, /mailOrganization/)
    assert.doesNotMatch(page, /organizationEnabled|legacyProviderView|mailOrganization/)
    assert.match(sidebar, /activeTab\.id === "mail"/)
    assert.match(apiPath, /\/workspaces\/\$\{encodeURIComponent/)
    assert.doesNotMatch(apiPath, /return "\/mail"/)
    assert.doesNotMatch(realtime, /workspaceId === "legacy"/)
  })

  test("mail settings owns connection removal", async () => {
    const [settings, workspace, page] = await Promise.all([
      readSource("/src/features/settings/screens/mail.tsx"),
      readSource("/src/features/workspaces/screens/workspace-settings.tsx"),
      readMailFeatureSource(readSource),
    ])
    assert.match(settings, /WorkspaceMailConnectionSection/)
    assert.doesNotMatch(workspace, /WorkspaceMailConnectionSection/)
    assert.doesNotMatch(page, /Disconnect Gmail|disconnectMail|\/connection[^\n]*DELETE/)
  })
}
