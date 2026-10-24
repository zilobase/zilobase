import {
  backgroundAttributes,
  recordBackgroundCounter,
  recordBackgroundHistogram,
} from "../../infrastructure/background/telemetry";
import type { RuntimeEnv } from "../../shared/config/config";

type Counter =
  | "provider"
  | "reserved_tokens"
  | "reported_tokens"
  | "cache"
  | "chunks"
  | "reused_chunks"
  | "index"
  | "retrieval"
  | "refill"
  | "authorization_rejection";
type Histogram = "provider_ms" | "index_lag_ms" | "database_ms" | "request_ms";
// Closed labels keep queries, source text, arbitrary errors and resource IDs out of metrics.
type Outcome =
  | "query"
  | "index"
  | "completed"
  | "failed"
  | "deferred"
  | "stale"
  | "hit"
  | "miss"
  | "semantic"
  | "keyword"
  | "configuration"
  | "workspace_disabled"
  | "index_building"
  | "query_empty"
  | "provider_timeout"
  | "provider_unavailable"
  | "capacity"
  | "retrieval_budget";
export function searchCounter(env: RuntimeEnv, name: Counter, outcome: Outcome, value = 1) {
  if (!Number.isFinite(value) || value < 0) return;
  recordBackgroundCounter(
    `search_${name}`,
    backgroundAttributes(env, "search.page_index", outcome),
    value,
  );
}
export function searchHistogram(env: RuntimeEnv, name: Histogram, outcome: Outcome, value: number) {
  if (!Number.isFinite(value)) return;
  recordBackgroundHistogram(
    `search_${name}`,
    Math.max(0, value),
    backgroundAttributes(env, "search.page_index", outcome),
  );
}
