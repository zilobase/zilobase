export function register({ readSource, assert, test }) {
  const readToolbarSource = async () =>
    (
      await Promise.all([
        readSource("/src/sections/databases/views/shared/components/database-view-toolbar.tsx"),
        readSource(
          "/src/sections/databases/views/shared/components/database-view-toolbar-dialogs.tsx",
        ),
      ])
    ).join("\n");
  test("inline database and meeting titles use editor heading two typography", async () => {
    const appStyles = await readSource("/src/styles/global.css");
    const databaseToolbarSource = await readToolbarSource();
    const meetingSource = await readSource(
      "/src/sections/pages/editor/extensions/meeting/components/meeting-view.tsx",
    );

    for (const source of [databaseToolbarSource, meetingSource]) {
      assert.match(source, /font-semibold leading-tight tracking-\[-0\.02em\]/);
      assert.match(source, /fullPage \? "text-2xl md:text-2xl" : "text-\[26px\]"/);
      assert.match(source, /data-structural-block-title/);
    }

    assert.match(
      appStyles,
      /:where\(\.database-block-shell, \.meeting-block-shell\)[\s\S]*\[data-structural-block-title\][\s\S]*font-weight: var\(--font-weight-semibold\) !important;/,
    );
  });
}
