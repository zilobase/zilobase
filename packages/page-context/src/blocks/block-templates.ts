/*
 * JSON templates for every block the editor's slash menu and plus menu insert.
 * The editor and server-side writers share them, so blocks built by the AI
 * match blocks a user inserts.
 */

export type BlockTemplateNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: BlockTemplateNode[];
  text?: string;
};
export type BlockTemplateContent = BlockTemplateNode | BlockTemplateNode[];

export function createDatabaseSetupBlockContent(databaseId: string): BlockTemplateNode[] {
  return [
    { type: "databaseBlock", attrs: { databaseId, setupMode: true, showTitle: true } },
    { type: "paragraph" },
  ];
}

export function createTabsContent(
  content: BlockTemplateNode[] = [{ type: "paragraph" }],
): BlockTemplateNode {
  return {
    type: "tabsBlock",
    content: Array.from({ length: 3 }, (_, index) => ({
      type: "tabPanel",
      attrs: { title: `Tab ${index + 1}` },
      content: index === 0 ? content : [{ type: "paragraph" }],
    })),
  };
}

export function blockTemplate(
  item: { id: string },
  attrs?: { databaseId?: string; meetingId?: string },
): BlockTemplateContent | null {
  const columnCount = item.id.startsWith("columns") ? Number(item.id.at(-1)) : null;

  if (columnCount) {
    return {
      type: "columnBlock",
      content: Array.from({ length: columnCount }, () => ({
        type: "column",
        content: [{ type: "paragraph" }],
      })),
    };
  }

  switch (item.id) {
    case "paragraph":
      return { type: "paragraph" };
    case "heading1":
      return { type: "heading", attrs: { level: 1 } };
    case "heading2":
      return { type: "heading", attrs: { level: 2 } };
    case "heading3":
      return { type: "heading", attrs: { level: 3 } };
    case "heading4":
      return { type: "heading", attrs: { level: 4 } };
    case "bulletList":
      return {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      };
    case "orderedList":
      return {
        type: "orderedList",
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      };
    case "taskList":
      return {
        type: "taskList",
        content: [{ type: "taskItem", content: [{ type: "paragraph" }] }],
      };
    case "tabsBlock":
      return createTabsContent();
    case "callout":
      return { type: "callout", content: [{ type: "paragraph" }] };
    case "blockquote":
      return {
        type: "blockquote",
        content: [{ type: "paragraph" }],
      };
    case "codeBlock":
      return { type: "codeBlock" };
    case "blockMath":
      return { type: "blockMath", attrs: { latex: "" } };
    case "tableOfContentsBlock":
      return { type: "tableOfContentsBlock" };
    case "imageBlock":
      return { type: "imageBlock" };
    case "videoBlock":
      return { type: "videoBlock" };
    case "embedBlock":
      return { type: "embedBlock" };
    case "youtube":
      return { type: "embedBlock", attrs: { provider: "youtube" } };
    case "figma":
      return { type: "embedBlock", attrs: { provider: "figma" } };
    case "excalidraw":
      return { type: "embedBlock", attrs: { provider: "excalidraw" } };
    case "miro":
      return { type: "embedBlock", attrs: { provider: "miro" } };
    case "fileBlock":
      return { type: "fileBlock" };
    case "bookmarkBlock":
      return { type: "bookmarkBlock" };
    case "pageBlock":
      return { type: "pageBlock" };
    case "linkPage":
      return { type: "pageBlock", attrs: { openPicker: true } };
    case "details":
      return {
        type: "details",
        content: [
          {
            type: "detailsSummary",
            content: [{ type: "text", text: "Toggle" }],
          },
          {
            type: "detailsContent",
            content: [{ type: "paragraph" }],
          },
        ],
      };
    case "horizontalRule":
      return [{ type: "horizontalRule" }, { type: "paragraph" }];
    case "table":
      return {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: "tableHeader",
              content: [{ type: "paragraph" }],
            })),
          },
          ...Array.from({ length: 2 }, () => ({
            type: "tableRow",
            content: Array.from({ length: 3 }, () => ({
              type: "tableCell",
              content: [{ type: "paragraph" }],
            })),
          })),
        ],
      };
    case "databaseBlock":
      return attrs?.databaseId ? createDatabaseSetupBlockContent(attrs.databaseId) : null;
    case "meetingBlock":
      return attrs?.meetingId
        ? { type: "meetingBlock", attrs: { meetingId: attrs.meetingId } }
        : null;
    default:
      return null;
  }
}
