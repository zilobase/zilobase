export function register({ assert, loadModule, test }) {
  test("agent metadata prefers draft values and preserves explicit removal of icon and cover", async () => {
    const { agentMetadata } = await loadModule("/src/features/ai/settings/model/agent-metadata.ts");
    const profile = {
      cover: "cover",
      icon: "icon",
      iconPosition: "top",
      name: "Saved",
      description: "Saved description",
    };
    assert.deepEqual(agentMetadata(profile, undefined), {
      cover: "cover",
      icon: "icon",
      iconPosition: "top",
      title: "Saved",
      description: "Saved description",
    });
    const draft = {
      cover: null,
      icon: { type: "image" },
      iconPosition: "inline",
      name: "Draft",
      description: "",
    };
    assert.deepEqual(agentMetadata(profile, draft), {
      cover: "",
      icon: "",
      iconPosition: "inline",
      title: "Draft",
      description: "",
    });
    assert.deepEqual(agentMetadata(profile, { cover: undefined, icon: undefined }), {
      cover: "",
      icon: "",
      iconPosition: "top",
      title: "Saved",
      description: "Saved description",
    });
    assert.equal(profile.name, "Saved");
  });
}
