import type { ClipCaptureMode } from "@zilobase/features/clips";
import type { ClipMetadata } from "@zilobase/html-to-page/extract-clip-metadata";

export type ExtractResult = {
  html: string;
  metadata: ClipMetadata;
  selectionPresent: boolean;
};

export type ExtractMessage = {
  type: "EXTRACT";
  captureMode: ClipCaptureMode;
};

export function isExtractMessage(value: unknown): value is ExtractMessage {
  return Boolean(
    value && typeof value === "object" && (value as ExtractMessage).type === "EXTRACT",
  );
}
