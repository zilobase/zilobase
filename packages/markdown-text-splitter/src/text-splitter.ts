import type { Document, TextSplitterOptions } from "./types.js";

export abstract class TextSplitter {
  protected readonly chunkSize: number;
  protected readonly chunkOverlap: number;
  protected readonly lengthFunction: (text: string) => number;
  protected readonly keepSeparator: boolean | "start" | "end";
  protected readonly addStartIndex: boolean;
  protected readonly stripWhitespace: boolean;

  public constructor(options: TextSplitterOptions = {}) {
    const {
      chunkSize = 4000,
      chunkOverlap = 200,
      lengthFunction = (text: string) => text.length,
      keepSeparator = false,
      addStartIndex = false,
      stripWhitespace = true,
    } = options;

    if (chunkSize <= 0) {
      throw new Error(`chunkSize must be > 0, got ${chunkSize}`);
    }

    if (chunkOverlap < 0) {
      throw new Error(`chunkOverlap must be >= 0, got ${chunkOverlap}`);
    }

    if (chunkOverlap > chunkSize) {
      throw new Error(
        `Got a larger chunk overlap (${chunkOverlap}) than chunk size (${chunkSize}), should be smaller.`,
      );
    }

    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.lengthFunction = lengthFunction;
    this.keepSeparator = keepSeparator;
    this.addStartIndex = addStartIndex;
    this.stripWhitespace = stripWhitespace;
  }

  public abstract splitText(text: string): string[];

  public createDocuments(
    texts: string[],
    metadatas?: Array<Record<string, unknown>>,
  ): Document[] {
    const metadataList = metadatas ?? Array.from({ length: texts.length }, () => ({}));
    const documents: Document[] = [];

    texts.forEach((text, index) => {
      let startIndex = 0;
      let previousChunkLength = 0;

      for (const chunk of this.splitText(text)) {
        const metadata = cloneMetadata(metadataList[index] ?? {});

        if (this.addStartIndex) {
          const offset = startIndex + previousChunkLength - this.chunkOverlap;
          startIndex = text.indexOf(chunk, Math.max(0, offset));
          metadata.start_index = startIndex;
          previousChunkLength = chunk.length;
        }

        documents.push({
          pageContent: chunk,
          metadata,
        });
      }
    });

    return documents;
  }

  public splitDocuments(documents: Document[]): Document[] {
    return this.createDocuments(
      documents.map((document) => document.pageContent),
      documents.map((document) => document.metadata),
    );
  }

  protected joinDocs(parts: string[], separator: string): string | null {
    const joined = parts.join(separator);
    const text = this.stripWhitespace ? joined.trim() : joined;
    return text || null;
  }

  protected mergeSplits(splits: Iterable<string>, separator: string): string[] {
    const separatorLength = this.lengthFunction(separator);
    const documents: string[] = [];
    let currentDoc: string[] = [];
    let total = 0;

    for (const split of splits) {
      const splitLength = this.lengthFunction(split);

      if (this.exceedsChunkSize(total, splitLength, currentDoc, separatorLength)) {
        this.appendJoinedDocument(documents, currentDoc, separator);
        ({ currentDoc, total } = this.trimOverlap(
          currentDoc,
          total,
          splitLength,
          separatorLength,
        ));
      }

      currentDoc.push(split);
      total += splitLength + (currentDoc.length > 1 ? separatorLength : 0);
    }

    const doc = this.joinDocs(currentDoc, separator);
    if (doc !== null) {
      documents.push(doc);
    }

    return documents;
  }

  private appendJoinedDocument(
    documents: string[],
    parts: string[],
    separator: string,
  ): void {
    if (parts.length === 0) return;

    const document = this.joinDocs(parts, separator);
    if (document !== null) documents.push(document);
  }

  private exceedsChunkSize(
    total: number,
    splitLength: number,
    parts: string[],
    separatorLength: number,
  ): boolean {
    return (
      total + splitLength + (parts.length > 0 ? separatorLength : 0) >
      this.chunkSize
    );
  }

  private trimOverlap(
    parts: string[],
    total: number,
    splitLength: number,
    separatorLength: number,
  ): { currentDoc: string[]; total: number } {
    let currentDoc = parts;
    let currentTotal = total;

    while (
      currentTotal > this.chunkOverlap ||
      (currentTotal > 0 &&
        this.exceedsChunkSize(
          currentTotal,
          splitLength,
          currentDoc,
          separatorLength,
        ))
    ) {
      currentTotal -=
        this.lengthFunction(currentDoc[0]) +
        (currentDoc.length > 1 ? separatorLength : 0);
      currentDoc = currentDoc.slice(1);
    }

    return { currentDoc, total: currentTotal };
  }
}

function cloneMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(metadata));
}
