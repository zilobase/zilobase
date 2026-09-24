import { Node, mergeAttributes } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

import { isAllowedEmbedSrc, isAllowedHttpUrl, isAllowedImageUrl } from "./safe-url";

const ClipperImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
    };
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="imageBlock"]' },
      {
        tag: "img[src]",
        getAttrs: (element) => {
          if (!isElement(element)) return false;
          const src = element.getAttribute("src");
          if (!isAllowedImageUrl(src)) return false;
          return {
            src,
            alt: element.getAttribute("alt"),
            title: element.getAttribute("title"),
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-type": "imageBlock" })];
  },
});

const ClipperVideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
    };
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="videoBlock"]' },
      {
        tag: "video[src]",
        getAttrs: (element) => {
          if (!isElement(element)) return false;
          const src = element.getAttribute("src");
          if (!isAllowedHttpUrl(src)) return false;
          return { src, title: element.getAttribute("title") };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", mergeAttributes(HTMLAttributes, { "data-type": "videoBlock" })];
  },
});

const ClipperEmbedBlock = Node.create({
  name: "embedBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
      provider: { default: null },
      width: { default: null },
    };
  },
  parseHTML() {
    return [
      { tag: 'div[data-type="embedBlock"]' },
      {
        tag: "iframe",
        priority: 60,
        getAttrs: (element) => {
          if (!isElement(element)) return false;
          const src = element.getAttribute("src");
          if (!isAllowedEmbedSrc(src)) return false;
          return {
            src,
            title: element.getAttribute("title"),
            provider: embedProvider(src),
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["iframe", mergeAttributes(HTMLAttributes, { "data-type": "embedBlock" })];
  },
});

const ClipperBookmarkBlock = Node.create({
  name: "bookmarkBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      href: { default: null },
      title: { default: null },
      description: { default: null },
      favicon: { default: null },
      image: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="bookmarkBlock"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "bookmarkBlock" })];
  },
});

function isElement(value: unknown): value is Element {
  return Boolean(
    value &&
    typeof value === "object" &&
    "getAttribute" in value &&
    typeof value.getAttribute === "function",
  );
}

function embedProvider(src: string | null) {
  if (!src) return null;
  try {
    const host = new URL(src).hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtube-nocookie.com") return "youtube";
    if (host === "vimeo.com" || host === "player.vimeo.com") return null;
    return null;
  } catch {
    return null;
  }
}

export const clipperExtensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false, autolink: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  ClipperImageBlock,
  ClipperVideoBlock,
  ClipperEmbedBlock,
  ClipperBookmarkBlock,
];
