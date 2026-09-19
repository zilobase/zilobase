// Deprecated: canonical implementation now lives in `@zilobase/runtime-adapter/node`.
// Kept for one release for compatibility; new code should import from the adapter package.
export {
  calendarRealtimeChannel,
  createNodeRealtimeBus,
  databaseRealtimeChannel,
  getRealtimeRedisUrl,
  mailRealtimeChannel,
  navigationRealtimeChannel,
  type NodeRealtimeBus,
  type RealtimeSubscription,
} from "@zilobase/runtime-adapter/node";
