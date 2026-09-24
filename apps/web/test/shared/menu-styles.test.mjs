export function register({ assert, loadModule, test }) {
  test("shared menu variants keep one default item geometry", async () => {
    const { menuItemVariants } = await loadModule("/apps/web/src/shared/ui/menu-styles.ts");

    const defaultItem = menuItemVariants();
    assert.match(defaultItem, /min-h-7/);
    assert.match(defaultItem, /px-2/);
    assert.match(defaultItem, /py-1/);
    assert.doesNotMatch(defaultItem, /min-h-9/);

    const comfortableItem = menuItemVariants({ size: "comfortable" });
    assert.match(comfortableItem, /min-h-9/);
    assert.match(comfortableItem, /py-2/);
  });

  test("destructive menu styling is a declared variant", async () => {
    const { menuContentVariants, menuItemVariants } = await loadModule(
      "/apps/web/src/shared/ui/menu-styles.ts",
    );
    const destructiveItem = menuItemVariants({ variant: "destructive" });

    assert.match(destructiveItem, /text-action-danger-text/);
    assert.match(destructiveItem, /focus:bg-feedback-error-subtle/);
    assert.match(menuContentVariants({ padding: "none", width: "lg" }), /p-0/);
    assert.match(menuContentVariants({ padding: "none", width: "lg" }), /w-64/);
  });
}
