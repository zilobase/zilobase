# AI conversations and agents

## Owning modules and interface

- [apps/server/src/features/ai](../../../apps/server/src/features/ai)
- [apps/web/src/features/ai](../../../apps/web/src/features/ai)
- [packages/features/src/ai-chat](../../../packages/features/src/ai-chat)

## Main flow

Personal chat/thread routes connect conversations to agent execution, context, tools and files. Standalone Custom Agents use their own conversation store and routes. Shared contracts describe conversations and settings; the web conversation adapter owns transport and live client state.

## Authorization and persistence

Agent profiles, revisions, conversations, runs, settings drafts and connector access are separate persisted concerns. Each agent has one canonical conversation keyed by profile. Personal `ai_chat_thread` rows cannot reference agent profiles, so the two conversation models do not overlap. Tools resolve actor/resource authority on the server; client visibility is not permission to execute.

Agent profile creation imports the collaboration [document codec](../../../apps/server/src/features/collaboration/document-codec.ts), avoiding a dependency on collaboration runtime dispatch and its agent triggers. Settings presentation enters through the active settings screens; unused legacy AI sidebar sections and unconsumed MCP wrappers are removed.

## Side effects, failures and recovery

Streaming work, draft flushing, tool approvals and queued runs have different lifetimes. MCP outbound requests use the pinned transport. Preserve cancellation, permission failures and recovery instead of treating all execution as a single request.

## Focused guides

- [Browser conversation state and presentation](conversations.md)
- [Agent execution and MCP](execution-and-mcp.md)
- [Settings drafts and publication](settings.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/ai) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Capability map

| Capability | Browser owner | Server owner |
|---|---|---|
| Conversation state and presentation | [conversations](../../../apps/web/src/features/ai/conversations): adapters, thread state, models, live effects and components | [conversations](../../../apps/server/src/features/ai/conversations): chat/thread transport, persistence and agent conversation operations |
| Settings | [settings](../../../apps/web/src/features/ai/settings): draft state and settings components | [settings](../../../apps/server/src/features/ai/settings): actor/context, instruction pages, drafts and publication |
| Agent profiles and durable runs | [screens](../../../apps/web/src/features/ai/screens) compose custom-agent navigation with settings/conversations | [agents](../../../apps/server/src/features/ai/agents) own profiles, revisions, resources and triggers; [execution](../../../apps/server/src/features/ai/execution) owns run queue, records, leases, checkpoints and model/tool composition |
| Context and files | [context](../../../apps/web/src/features/ai/context) derives page context; [files](../../../apps/web/src/features/ai/files) handles uploads and prompt attachments | [context](../../../apps/server/src/features/ai/context) composes page/database/agent context and system instructions; [files](../../../apps/server/src/features/ai/files) owns file transport, storage and extraction |
| Tools and background work | Conversation elements present tool calls, approvals and results | [tools](../../../apps/server/src/features/ai/tools) and [actions](../../../apps/server/src/features/ai/actions) implement operations/approval contracts; [jobs](../../../apps/server/src/features/ai/jobs) owns queued work, including thread summaries |

MCP is grouped into [connections](../../../apps/server/src/features/ai/mcp/connections) for configuration, credentials, OAuth, catalog and materialization; [execution](../../../apps/server/src/features/ai/mcp/execution) for tool binding, approval and run snapshots; and [transport](../../../apps/server/src/features/ai/mcp/transport) for the client, errors and secure egress. The scope policy stays at the MCP capability root because connection and execution paths both use it. HTTP composition enters through `mcp/routes.ts`.

The [web interface](../../../apps/web/src/features/ai/index.ts) exports `useAiChatThreadState`; routing enters screens explicitly. Reusable conversation primitives stay internal to the feature. The shared package name and `ai-chat` subpaths remain stable. Vite adapter selection and the web harness resolve the conversation location explicitly. Personal chat writes use the single canonical thread-turn endpoint.

The pure [draft action rules](../../../apps/web/src/features/ai/settings/model/draft-actions.ts) distinguish card visibility, save/discard availability and mutation busy state. [Behavioral tests](../../../apps/web/test/features/ai/settings-actions.test.mjs) cover pending runs, conflicts and read-only actors; the rendered actions retain mutation and toast ownership.
