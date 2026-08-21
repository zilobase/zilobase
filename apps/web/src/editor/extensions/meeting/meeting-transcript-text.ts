import * as Y from "yjs"

export function meetingTranscriptPlainText(document: Y.Doc) {
  return document
    .getXmlFragment("transcript")
    .toArray()
    .map(xmlNodeText)
    .join("\n\n")
}

function xmlNodeText(node: Y.XmlElement | Y.XmlHook | Y.XmlText): string {
  const candidate = node as unknown as {
    toArray?: () => Array<Y.XmlElement | Y.XmlHook | Y.XmlText>
    toDelta?: () => unknown
  }
  if (typeof candidate.toDelta === "function") {
    return node.toString()
  }
  return candidate.toArray?.().map(xmlNodeText).join("") ?? ""
}
