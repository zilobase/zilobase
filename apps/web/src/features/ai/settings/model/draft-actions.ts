type Draft = {
  state?: { canEdit: boolean; pendingRun?: unknown };
  dirty: boolean;
  error: string | null;
  publish: { isPending: boolean };
  discard: { isPending: boolean };
  createInstruction: { isPending: boolean };
};

export function settingsActionsBusy(draft: Draft) {
  return draft.publish.isPending || draft.discard.isPending || draft.createInstruction.isPending;
}

export function settingsActionsVisible(draft: Draft, card: boolean) {
  if (!draft.state?.canEdit) return false;
  if (!card) return true;
  return Boolean(draft.dirty || draft.error || draft.state.pendingRun);
}

export function settingsActionAvailability(draft: Draft) {
  const busy = settingsActionsBusy(draft);
  return {
    discardDisabled: busy || (!draft.dirty && !draft.error),
    saveDisabled: busy || (!draft.dirty && !draft.state?.pendingRun),
  };
}

export function settingsProgressLabel(aiEditing: boolean, syncing: boolean, loaded: boolean) {
  if (aiEditing) return "AI is preparing your changes…";
  if (syncing) return "Preserving private draft…";
  return loaded ? "" : "Loading settings…";
}

export function sharingActionAvailability(draft: Draft) {
  return {
    canEdit: Boolean(draft.state?.canEdit) && !draft.publish.isPending && !draft.discard.isPending,
    actionsDisabled: !draft.dirty || draft.publish.isPending || draft.discard.isPending,
  };
}
