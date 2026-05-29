const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`

export const integrationIcons = {
  gmail: publicAsset("icons/gmail.svg"),
  github: publicAsset("icons/github.svg"),
  "google-calendar": publicAsset("icons/google-calendar.svg"),
  googleCalendar: publicAsset("icons/google-calendar.svg"),
  "google-drive": publicAsset("icons/google-drive.svg"),
  googleDrive: publicAsset("icons/google-drive.svg"),
  linear: publicAsset("icons/linear.svg"),
  slack: publicAsset("icons/slack.svg"),
} as const
