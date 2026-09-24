export function register({ assert, loadModule, test }) {
  test("mail properties use custom names before system labels, retaining explicit empty names", async () => {
    const { mailPropertyLabel } = await loadModule(
      "/src/features/mail/organization/property-label.ts",
    );
    assert.equal(mailPropertyLabel("id", { name: "Custom" }, { label: "System" }), "Custom");
    assert.equal(mailPropertyLabel("id", undefined, { label: "System" }), "System");
    assert.equal(mailPropertyLabel("id", undefined, undefined), "id");
    assert.equal(mailPropertyLabel("id", { name: "" }, { label: "System" }), "");
  });
}
