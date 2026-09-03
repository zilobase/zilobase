import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, readSource, readWorkspace, test }) {
  test("mail reuses data-source-neutral property controls", async () => {
    const [databaseAdd, picker, valueControl, panel] = await Promise.all([
      readSource("/src/features/databases/properties/editors/add-database-property-menu.tsx"),
      readSource("/src/features/databases/properties/shared/property-type-picker.tsx"),
      readSource("/src/features/databases/properties/shared/property-value-control.tsx"),
      readSource("/src/features/mail/components/mail-properties-panel.tsx"),
    ])

    assert.match(databaseAdd, /PropertyTypePicker/)
    assert.match(panel, /PropertyTypePicker/)
    assert.match(panel, /DataSourcePropertyValueControl/)
    assert.match(picker, /Search property types|Select type/)
    for (const type of ["checkbox", "select", "status", "multi_select", "person", "files", "number", "date", "url"]) {
      assert.ok(valueControl.includes(`type === "${type}"`) || valueControl.includes(`type === "${type.split("_")[0]}"`), `missing ${type} value UI`)
    }
  })

  test("mail properties support search, visibility, ordering, CRUD, cells, and thread editing", async () => {
    const [panel, page, hook] = await Promise.all([
      readSource("/src/features/mail/components/mail-properties-panel.tsx"),
      readMailFeatureSource(readSource),
      readWorkspace("/packages/features/src/mail/hooks.ts"),
    ])

    assert.match(panel, /Search for a property/)
    assert.match(panel, /Reorder\.Group/)
    assert.match(panel, /hiddenPropertyIds/)
    assert.match(panel, /Add property/)
    assert.match(panel, /Delete .*Thread values will also be removed/)
    assert.match(panel, /MailThreadPropertyBar/)
    assert.match(page, /customValuesByThread/)
    assert.match(page, /hidden min-w-0 items-center gap-1 xl:flex/)
    assert.match(page, /propertiesEditor=/)
    assert.match(hook, /method: "POST"/)
    assert.match(hook, /method: "PATCH"/)
    assert.match(hook, /method: "DELETE"/)
    assert.match(hook, /method: "PUT"/)
  })

  test("custom properties participate in saved filters and groups", async () => {
    const [filter, group, page] = await Promise.all([
      readSource("/src/features/mail/components/mail-filter-editor.tsx"),
      readSource("/src/features/mail/components/mail-group-editor.tsx"),
      readMailFeatureSource(readSource),
    ])

    assert.match(filter, /customProperties\.map/)
    assert.match(filter, /members\.map/)
    assert.match(group, /customProperties\.filter\(isGroupableCustomProperty\)/)
    assert.match(page, /customValues\?\.\[propertyId\]/)
    assert.match(page, /mailPropertiesQuery\.setThreadValue/)
  })
}
