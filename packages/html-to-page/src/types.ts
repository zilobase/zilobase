export type PageDocumentMark = {
  attrs?: Record<string, unknown>;
  type: string;
};

export type PageDocumentNode = {
  attrs?: Record<string, unknown>;
  content?: PageDocumentNode[];
  marks?: PageDocumentMark[];
  text?: string;
  type?: string;
};

export type PageDocument = {
  type: "doc";
  content: PageDocumentNode[];
};

export type ClipMetadata = {
  author: string | null;
  canonicalUrl: string | null;
  description: string | null;
  domain: string;
  favicon: string | null;
  image: string | null;
  published: string | null;
  selectionText: string | null;
  site: string | null;
  schemaType: string | null;
  title: string;
  url: string;
  wordCount: number;
};

export type AssembleClipDocumentInput = {
  content?: PageDocument | null;
  description?: string | null;
  favicon?: string | null;
  image?: string | null;
  note?: string | null;
  sourceUrl: string;
  title: string;
};
