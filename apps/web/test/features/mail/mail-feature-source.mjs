const mailFeatureFiles = [
  "/src/features/mail/pages/mail.tsx",
  "/src/features/mail/components/mail-actions.tsx",
  "/src/features/mail/components/mail-connection-state.tsx",
  "/src/features/mail/components/mail-conversation-viewer.tsx",
  "/src/features/mail/components/mail-thread-row.tsx",
  "/src/features/mail/components/mailbox-thread-list.tsx",
  "/src/features/mail/components/mailbox-topbar.tsx",
  "/src/features/mail/model/mail-view-model.ts",
]

export async function readMailFeatureSource(readSource) {
  return (await Promise.all(mailFeatureFiles.map((file) => readSource(file)))).join("\n")
}
