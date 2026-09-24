export interface Document<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  pageContent: string;
  metadata: TMetadata;
}

export enum Language {
  MARKDOWN = "markdown",
}

export interface TextSplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  lengthFunction?: (text: string) => number;
  keepSeparator?: boolean | "start" | "end";
  addStartIndex?: boolean;
  stripWhitespace?: boolean;
}
