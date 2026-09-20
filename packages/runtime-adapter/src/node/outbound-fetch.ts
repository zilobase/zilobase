import type { OutboundFetch } from "@zilobase/runtime-ports";
import { fetchPinnedNodeMcp } from "./pinned-mcp";
import { fetchPinnedNodeWebhook } from "./pinned-webhook";

export function createNodeOutboundFetch(options: {
  fetchMcp?: OutboundFetch["fetchMcp"];
  fetchWebhook?: OutboundFetch["fetchWebhook"];
} = {}): OutboundFetch {
  return {
    fetchMcp: options.fetchMcp ?? fetchPinnedNodeMcp,
    fetchWebhook: options.fetchWebhook ?? fetchPinnedNodeWebhook,
  };
}
