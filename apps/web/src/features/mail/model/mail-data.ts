export type MailFolder = "archive" | "drafts" | "inbox" | "sent" | "spam" | "trash"

export type MailMessage = {
  attachment?: boolean
  folder: MailFolder
  group: "Earlier" | "Today" | "Yesterday"
  id: string
  preview: string
  recipient?: string
  sender: string
  starred: boolean
  subject: string
  time: string
  unread: boolean
}

export const starterMailMessages: MailMessage[] = [
  {
    folder: "inbox",
    group: "Today",
    id: "welcome-to-mail",
    preview: "Your focused Zilobase inbox is ready. Here are a few ways to make it yours.",
    sender: "Zilobase",
    starred: true,
    subject: "Welcome to Mail",
    time: "8:42 AM",
    unread: true,
  },
  {
    attachment: true,
    folder: "inbox",
    group: "Today",
    id: "launch-review",
    preview: "I added the final notes and attached the revised launch checklist for review.",
    sender: "Maya Chen",
    starred: false,
    subject: "Launch checklist — final review",
    time: "7:16 AM",
    unread: true,
  },
  {
    folder: "inbox",
    group: "Yesterday",
    id: "weekly-design",
    preview: "The new navigation direction is ready. Let me know which option you prefer.",
    sender: "Design team",
    starred: false,
    subject: "Weekly design update",
    time: "Yesterday",
    unread: false,
  },
  {
    folder: "inbox",
    group: "Yesterday",
    id: "invoice",
    preview: "Your August invoice is available. No action is needed at this time.",
    sender: "Cloudflare",
    starred: false,
    subject: "Your August invoice",
    time: "Yesterday",
    unread: false,
  },
  {
    folder: "inbox",
    group: "Earlier",
    id: "community",
    preview: "Five thoughtful conversations from builders in the community this week.",
    sender: "FOSS United",
    starred: true,
    subject: "This week in the community",
    time: "28 Aug",
    unread: false,
  },
  {
    folder: "inbox",
    group: "Earlier",
    id: "security",
    preview: "A new sign-in was detected from a device in Bengaluru, India.",
    sender: "GitHub",
    starred: false,
    subject: "New sign-in to your account",
    time: "27 Aug",
    unread: true,
  },
  {
    folder: "sent",
    group: "Today",
    id: "sent-project-notes",
    preview: "Sharing the notes and open decisions from today’s project review.",
    recipient: "team@zilobase.com",
    sender: "You",
    starred: false,
    subject: "Project review notes",
    time: "9:05 AM",
    unread: false,
  },
  {
    folder: "drafts",
    group: "Today",
    id: "draft-roadmap",
    preview: "A first pass at the September roadmap and the tradeoffs we discussed…",
    recipient: "Product team",
    sender: "Draft",
    starred: false,
    subject: "September roadmap",
    time: "6:31 AM",
    unread: false,
  },
  {
    folder: "archive",
    group: "Earlier",
    id: "archived-receipt",
    preview: "Thanks for your payment. Your receipt is attached for your records.",
    sender: "Linear",
    starred: false,
    subject: "Payment receipt",
    time: "24 Aug",
    unread: false,
  },
]
