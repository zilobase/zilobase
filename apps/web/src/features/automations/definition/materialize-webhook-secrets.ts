import type { BuilderDraft } from "./automation-draft";
import { resolveWebhookHeader } from "../actions/notion-action-model";

export async function materializeWebhookSecrets(
  draft: BuilderDraft,
  createSecret: (input: {
    purpose: "webhook_header";
    value: string;
  }) => Promise<{ id: string }>,
) {
  let saveDraft = draft;
  for (const actionDraft of saveDraft.actions) {
    if (actionDraft.action.type !== "send_webhook") continue;
    for (const header of actionDraft.webhookHeaders) {
      if (!header.name.trim() || !header.value) continue;
      const secret = await createSecret({
        purpose: "webhook_header",
        value: header.value,
      });
      saveDraft = {
        ...saveDraft,
        actions: saveDraft.actions.map((candidate) =>
          candidate.action.id === actionDraft.action.id
            ? resolveWebhookHeader(candidate, header.key, secret.id)
            : candidate,
        ),
      };
    }
  }
  return saveDraft;
}
