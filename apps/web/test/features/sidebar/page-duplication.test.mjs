export function register({ assert, loadModule, test }) {
  test("navigation links use the database owner and preserve page link representation", async () => {
    const { getNavigationItemPath } = await loadModule(
      "/src/features/sidebar/model/database-view-navigation.ts",
    );
    assert.equal(getNavigationItemPath({ databaseId: "db", pageId: "backing-page" }), "/d/db");
    assert.equal(getNavigationItemPath({ pageId: "page" }), "/p/page");
    assert.equal(getNavigationItemPath({ pageId: null }), "/p/null");
  });
  test("page duplication clones nested content and strips comment marks without changing the source", async () => {
    const { clonePageContent, getDuplicatePageName } = await loadModule(
      "/src/features/sidebar/model/page-duplication.ts",
    );
    const source = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hello",
              marks: [{ type: "bold" }, { type: "comment", attrs: { id: "comment" } }],
            },
          ],
        },
      ],
    };
    const duplicate = clonePageContent(source);
    assert.deepEqual(duplicate.content[0].content[0].marks, [{ type: "bold" }]);
    assert.equal(source.content[0].content[0].marks.length, 2);
    duplicate.content[0].content[0].text = "Changed";
    assert.equal(source.content[0].content[0].text, "Hello");
    assert.equal(clonePageContent(null), null);
    assert.equal(getDuplicatePageName("  "), "Untitled copy");
    assert.equal(getDuplicatePageName(" Page "), "Page copy");
  });
}
