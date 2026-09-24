const mailFeatureFiles = [
  "/src/features/mail/screens/mail.tsx",
  "/src/features/mail/messages/mail-actions.tsx",
  "/src/features/mail/connections/mail-connection-state.tsx",
  "/src/features/mail/messages/mail-conversation-viewer.tsx",
  "/src/features/mail/messages/mail-thread-row.tsx",
  "/src/features/mail/mailbox/mailbox-thread-list.tsx",
  "/src/features/mail/mailbox/mailbox-topbar.tsx",
  "/src/features/mail/organization/mail-view-model.ts",
];

export async function readMailFeatureSource(readSource) {
  return (await Promise.all(mailFeatureFiles.map((file) => readSource(file)))).join("\n");
}
