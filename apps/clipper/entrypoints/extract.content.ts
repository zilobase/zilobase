import { extractClipMetadata } from "@zilobase/html-to-page/extract-clip-metadata";
import type { ClipCaptureMode } from "@zilobase/features/clips";
import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";

import { isExtractMessage, type ExtractResult } from "../lib/messages";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message) => {
      if (!isExtractMessage(message)) return;
      return Promise.resolve(extractPage(message.captureMode));
    });
  },
});

function extractPage(captureMode: ClipCaptureMode): ExtractResult {
  const selection = window.getSelection();
  const selectionHtml = selection?.rangeCount
    ? fragmentHtml(selection.getRangeAt(0).cloneContents())
    : "";
  const selectionPresent = Boolean(selectionHtml.trim() || selection?.toString().trim());
  const html = captureHtml(captureMode, selectionHtml, selection);

  return {
    html,
    metadata: extractClipMetadata(document, location.href),
    selectionPresent,
  };
}

function captureHtml(
  captureMode: ClipCaptureMode,
  selectionHtml: string,
  selection: Selection | null,
) {
  return captureMode === "selection"
    ? selectionHtml || `<p>${escapeHtml(selection?.toString() ?? "")}</p>`
    : captureMode === "bookmark"
      ? ""
      : captureMode === "page"
        ? (document.body?.innerHTML ?? "")
        : articleHtml();
}

function articleHtml() {
  const article =
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.querySelector('[role="main"]') ??
    document.body;
  return article?.innerHTML ?? "";
}

function fragmentHtml(fragment: DocumentFragment) {
  const container = document.createElement("div");
  container.append(fragment);
  return container.innerHTML;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
