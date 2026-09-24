export function register({ assert, loadModule, readSource, test }) {
  test("page and database picker search is normalized and relevance ranked", async () => {
    const { filterPageDatabasePickerOptions } = await loadModule(
      "/src/features/databases/components/page-database-picker-model.ts",
    );
    const options = [
      { label: "Project Decaféteria", value: "contains" },
      { label: "Café planning", value: "starts" },
      {
        label: "Quarterly plan",
        searchText: "Quarterly plan Café",
        value: "word",
      },
      { label: "Unrelated", value: "none" },
    ];

    assert.deepEqual(
      filterPageDatabasePickerOptions(options, "  CAFE ").map((option) => option.value),
      ["starts", "word", "contains"],
    );
    assert.strictEqual(filterPageDatabasePickerOptions(options, ""), options);
  });

  test("page and database selectors use the shared picker", async () => {
    const sources = await Promise.all([
      readSource("/src/features/databases/schema/editors/database-derived-property-value.tsx"),
      readSource(
        "/src/features/databases/schema/configuration/relation/relation-property-settings.tsx",
      ),
      readSource("/src/features/databases/views/view-settings/components/data-source-settings.tsx"),
      readSource("/src/features/databases/views/components/linked-data-source-picker.tsx"),
      readSource("/src/features/databases/setup/components/database-setup-card.tsx"),
      readSource("/src/features/sidebar/components/sidebar-customize-panel.tsx"),
    ]);

    for (const source of sources) {
      assert.match(source, /PageDatabasePicker/);
    }

    assert.doesNotMatch(sources[0], /className="database-select-option"/);
  });
}
