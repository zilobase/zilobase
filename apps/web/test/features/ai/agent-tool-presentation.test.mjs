export function register({ assert, loadModule, test }) {
  test("resolves native agent tool presentation from local data", async () => {
    const { resolveAgentToolPresentation } = await loadModule(
      "/src/features/ai/components/elements/agent-tool-presentation.ts",
    );

    assert.deepEqual(
      resolveAgentToolPresentation({
        part: {},
        title: "Read Zilobase page",
        toolName: "readWorkspacePage",
      }),
      {
        progressPhrases: ["Running Read Zilobase page"],
        title: "Read Zilobase page",
      },
    );

    assert.deepEqual(
      resolveAgentToolPresentation({
        part: {},
        toolName: "future_agent_step",
      }),
      {
        progressPhrases: ["Running Future agent step"],
        title: "Future agent step",
      },
    );
  });
}
