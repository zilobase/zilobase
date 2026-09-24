export function register({ assert, loadModule, readSource, test }) {
  test("oauth consent helpers label scopes and preserve signed query", async () => {
    const { labelForScope, parseRequestedScopes } = await loadModule(
      "/src/features/oauth/lib/scope-labels.ts",
    );
    const { isOAuthLoginSearch, readOAuthQuery, pickOAuthSearch } = await loadModule(
      "/src/features/oauth/lib/oauth-query.ts",
    );

    assert.deepEqual(parseRequestedScopes("openid+clips.write"), ["openid", "clips.write"]);
    assert.equal(labelForScope("clips.write").title, "Save clips");
    assert.equal(isOAuthLoginSearch({ client_id: "zilobase-web-clipper" }), true);
    assert.equal(isOAuthLoginSearch({ error: "invalid" }), false);
    assert.equal(readOAuthQuery("?client_id=abc&scope=openid"), "client_id=abc&scope=openid");
    assert.deepEqual(pickOAuthSearch({ client_id: "abc", returnTo: "/recents" }), {
      client_id: "abc",
    });
  });

  test("oauth consent and callback are public lazy routes", async () => {
    const source = await readSource("/src/app/routing/route-groups/public-routes.tsx");
    assert.match(source, /path: "\/oauth\/consent"/);
    assert.match(source, /path: "\/oauth\/callback"/);
    assert.match(source, /features\/oauth\/screens\/consent/);
    assert.match(source, /features\/oauth\/screens\/callback/);
  });
}
