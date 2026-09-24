import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";

import { completeClipperOAuth, startClipperOAuth } from "../lib/oauth";

export default defineBackground(() => {
  browser.contextMenus.create({
    id: "zilobase-clip-page",
    title: "Save page to Zilobase",
    contexts: ["page"],
  });
  browser.contextMenus.create({
    id: "zilobase-clip-selection",
    title: "Save selection to Zilobase",
    contexts: ["selection"],
  });

  browser.contextMenus.onClicked.addListener(() => {
    void browser.action.openPopup();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "open-clipper" || command === "quick-clip") {
      void browser.action.openPopup();
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      message.type !== "CLIPPER_OAUTH_START"
    ) {
      return;
    }

    const instanceUrl =
      "instanceUrl" in message && typeof message.instanceUrl === "string"
        ? message.instanceUrl
        : "";
    void startClipperOAuth(instanceUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Connect failed",
        }),
      );
    return true;
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url?.includes("/oauth/callback")) {
      return;
    }

    void completeClipperOAuth(changeInfo.url)
      .then(async (session) => {
        if (!session) return;
        await browser.tabs.remove(tabId).catch(() => undefined);
      })
      .catch(() => undefined);
  });
});
