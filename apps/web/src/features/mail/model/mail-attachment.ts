export function safeMailDownloadFilename(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180)
  return normalized || "attachment"
}
