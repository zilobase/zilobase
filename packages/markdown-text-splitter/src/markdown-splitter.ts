import { RecursiveCharacterTextSplitter } from "./character-splitter.js";
import type { Document } from "./types.js";
import { Language } from "./types.js";

export interface MarkdownTextSplitterOptions {
  headersToSplitOn?: Array<[string, string]>;
  returnEachLine?: boolean;
  stripHeaders?: boolean;
}

export class RecursiveMarkdownTextSplitter extends RecursiveCharacterTextSplitter {
  public constructor(
    options: Omit<
      ConstructorParameters<typeof RecursiveCharacterTextSplitter>[0],
      "separators"
    > = {},
  ) {
    super({
      ...options,
      separators: RecursiveCharacterTextSplitter.getSeparatorsForLanguage(Language.MARKDOWN),
      isSeparatorRegex: true,
    });
  }
}

export class MarkdownTextSplitter {
  private chunks: Document<Record<string, string>>[] = [];
  private currentChunk: Document<Record<string, string>> = toDocument("", {});
  private currentHeaderStack: Array<[number, string]> = [];
  private readonly stripHeaders: boolean;
  private readonly splittableHeaders: Record<string, string>;
  private readonly returnEachLine: boolean;

  public constructor(options: MarkdownTextSplitterOptions = {}) {
    const { headersToSplitOn, returnEachLine = false, stripHeaders = true } = options;

    this.stripHeaders = stripHeaders;
    this.splittableHeaders = Object.fromEntries(
      headersToSplitOn ?? [
        ["#", "Header 1"],
        ["##", "Header 2"],
        ["###", "Header 3"],
        ["####", "Header 4"],
        ["#####", "Header 5"],
        ["######", "Header 6"],
      ],
    );
    this.returnEachLine = returnEachLine;
  }

  public splitText(text: string): Document<Record<string, string>>[] {
    this.chunks = [];
    this.currentChunk = toDocument("", {});
    this.currentHeaderStack = [];

    const rawLines = text.split(/(?<=\n)/);

    while (rawLines.length > 0) {
      const rawLine = rawLines.shift() ?? "";
      const headerMatch = this.matchHeader(rawLine);
      const codeMatch = this.matchCode(rawLine);
      const horizontalRuleMatch = this.matchHorizontalRule(rawLine);

      if (headerMatch) {
        this.completeChunkDocument();
        if (!this.stripHeaders) {
          this.currentChunk.pageContent += rawLine;
        }

        const headerDepth = headerMatch[1].length;
        const headerText = headerMatch[2];
        this.resolveHeaderStack(headerDepth, headerText);
      } else if (codeMatch) {
        this.completeChunkDocument();
        this.currentChunk.pageContent = this.resolveCodeChunk(rawLine, rawLines);
        this.currentChunk.metadata.Code = codeMatch[1];
        this.completeChunkDocument();
      } else if (horizontalRuleMatch) {
        this.completeChunkDocument();
      } else {
        this.currentChunk.pageContent += rawLine;
      }
    }

    this.completeChunkDocument();

    if (!this.returnEachLine) {
      return this.chunks;
    }

    return this.chunks.flatMap((chunk) =>
      chunk.pageContent
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => toDocument(line, { ...chunk.metadata })),
    );
  }

  private resolveHeaderStack(headerDepth: number, headerText: string): void {
    for (let index = 0; index < this.currentHeaderStack.length; index += 1) {
      if (this.currentHeaderStack[index][0] >= headerDepth) {
        this.currentHeaderStack = this.currentHeaderStack.slice(0, index);
        break;
      }
    }

    this.currentHeaderStack.push([headerDepth, headerText]);
  }

  private resolveCodeChunk(currentLine: string, rawLines: string[]): string {
    let chunk = currentLine;

    while (rawLines.length > 0) {
      const rawLine = rawLines.shift() ?? "";
      chunk += rawLine;

      if (this.matchCode(rawLine)) {
        return chunk;
      }
    }

    return "";
  }

  private completeChunkDocument(): void {
    const chunkContent = this.currentChunk.pageContent;

    if (chunkContent && chunkContent.trim().length > 0) {
      for (const [depth, value] of this.currentHeaderStack) {
        const headerKey = this.splittableHeaders["#".repeat(depth)];
        if (headerKey) {
          this.currentChunk.metadata[headerKey] = value;
        }
      }

      this.chunks.push(this.currentChunk);
    }

    this.currentChunk = toDocument("", {});
  }

  private matchHeader(line: string): RegExpMatchArray | null {
    const match = line.match(/^(#{1,6}) (.*)/);
    if (match && this.splittableHeaders[match[1]]) {
      return match;
    }

    return null;
  }

  private matchCode(line: string): RegExpMatchArray | null {
    return line.match(/^```(.*)/) ?? line.match(/^~~~(.*)/);
  }

  private matchHorizontalRule(line: string): RegExpMatchArray | null {
    return line.match(/^\*\*\*+\n/) ?? line.match(/^---+\n/) ?? line.match(/^___+\n/);
  }
}

function toDocument(
  pageContent: string,
  metadata: Record<string, string>,
): Document<Record<string, string>> {
  return {
    pageContent,
    metadata,
  };
}
