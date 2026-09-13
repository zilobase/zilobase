export function register({ assert, loadModule, readSource, test }) {
  test("the community edition alias resolves its runtime module", async () => {
    const { editionWebModule } = await loadModule("@zilobase/edition-web");
    assert.deepEqual(editionWebModule, {
      routePrefix: "/_edition",
      additionalLoginMethods: [],
      components: {},
      navigation: [],
      routes: [],
      settingsSections: [],
    });
  });

  test("additional login methods receive the shared email below its field", async () => {
    const source = await readSource(
      "/src/features/auth/components/login-form.tsx",
    );
    const emailField = source.indexOf('htmlFor="email"');
    const additionalMethods = source.indexOf(
      "editionWebModule.additionalLoginMethods.map",
    );
    const passwordField = source.indexOf('htmlFor="password"');

    assert.ok(emailField >= 0);
    assert.ok(additionalMethods > emailField);
    assert.ok(passwordField > additionalMethods);
    assert.match(
      source,
      /<LoginMethod disabled=\{isPending\} email=\{email\} key=\{index\} \/>/,
    );
  });
}
