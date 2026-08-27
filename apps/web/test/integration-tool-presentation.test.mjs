export function register({ assert, loadModule, test }) {
  test("resolves integration tool presentation from local data", async () => {
    const { resolveIntegrationToolPresentation } = await loadModule(
      "/src/components/ai-elements/integration-tool-presentation.ts",
    );

    assert.deepEqual(
      resolveIntegrationToolPresentation({
        part: {},
        source: "gmail",
        title: "Read Gmail message",
        toolName: "getGmailMessage",
      }),
      {
        progressPhrases: ["Running Read Gmail message"],
        source: "gmail",
        title: "Read Gmail message",
      },
    );

    assert.deepEqual(
      resolveIntegrationToolPresentation({
        part: {},
        toolName: "futureConnector_records_list",
      }),
      {
        progressPhrases: ["Running Future Connector records list"],
        source: undefined,
        title: "Future Connector records list",
      },
    );
  });
}
