import {
  MarkdownTextSplitter,
  RecursiveMarkdownTextSplitter,
} from "./index.js";

const sampleMarkdown = `# Zilobase Markdown Splitter

This intro paragraph is intentionally a little long so the recursive
splitter has a reason to produce more than one chunk when the chunk size
is kept small.

## Setup

Install dependencies and build the package.

| Step | Command |
| --- | --- |
| Install | \`npm install\` |
| Build | \`npm run build\` |

\`\`\`ts
const message = "code blocks stay together";
console.log(message);
\`\`\`

## Details

The second section adds more body text to show how header metadata is
carried forward while chunking. It also includes a list:

- item one
- item two
- item three

| Splitter | Keeps metadata | Notes |
| --- | --- | --- |
| \`MarkdownTextSplitter\` | Yes | Tracks headers and code blocks |
| \`RecursiveMarkdownTextSplitter\` | No | Recursive chunking by size and separators |

### Deep Dive

Nested headings should appear in the metadata for the header-based
splitters.

---

## Wrap Up

Final paragraph.`;

type ChunkDocument = {
  pageContent: string;
  metadata: Record<string, string>;
};

type BlockType = "prose" | "code" | "table";

type ContentBlock = {
  type: BlockType;
  content: string;
};

function printTitle(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function printDocuments(label: string, docs: ChunkDocument[]): void {
  printTitle(label);

  docs.forEach((doc, index) => {
    console.log(`\n[Chunk ${index + 1}]`);
    console.log("metadata:", JSON.stringify(doc.metadata));
    console.log(doc.pageContent);
  });
}

function splitChunkPreservingTablesAndCode(
  content: string,
  proseSplitter: RecursiveMarkdownTextSplitter,
): string[] {
  const blocks = extractBlocks(content);
  const chunks: string[] = [];

  for (const block of blocks) {
    if (block.type === "code" || block.type === "table") {
      chunks.push(block.content);
      continue;
    }

    chunks.push(...proseSplitter.splitText(block.content));
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

function extractBlocks(content: string): ContentBlock[] {
  const lines = content.split("\n");
  const blocks: ContentBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const result = readBlock(lines, index, trimmed);
    blocks.push(result.block);
    index = result.nextIndex;
  }

  return blocks;
}

function readBlock(
  lines: string[],
  index: number,
  trimmedLine: string,
): { block: ContentBlock; nextIndex: number } {
  if (isFenceStart(trimmedLine)) {
    return readFencedBlock(lines, index, trimmedLine.slice(0, 3));
  }

  if (isTableLine(trimmedLine)) {
    return readConsecutiveBlock(lines, index, "table", isTableLine);
  }

  return readConsecutiveBlock(
    lines,
    index,
    "prose",
    (line) => !isFenceStart(line) && !isTableLine(line),
  );
}

function readFencedBlock(
  lines: string[],
  index: number,
  fence: string,
): { block: ContentBlock; nextIndex: number } {
  const blockLines = [lines[index] ?? ""];
  let nextIndex = index + 1;

  while (nextIndex < lines.length) {
    const line = lines[nextIndex] ?? "";
    blockLines.push(line);
    nextIndex += 1;
    if (line.trim().startsWith(fence)) break;
  }

  return {
    block: { type: "code", content: blockLines.join("\n") },
    nextIndex,
  };
}

function readConsecutiveBlock(
  lines: string[],
  index: number,
  type: Exclude<BlockType, "code">,
  belongsToBlock: (line: string) => boolean,
): { block: ContentBlock; nextIndex: number } {
  const blockLines = [lines[index] ?? ""];
  let nextIndex = index + 1;

  while (nextIndex < lines.length) {
    const trimmedLine = (lines[nextIndex] ?? "").trim();
    if (!trimmedLine || !belongsToBlock(trimmedLine)) break;
    blockLines.push(lines[nextIndex] ?? "");
    nextIndex += 1;
  }

  return {
    block: { type, content: blockLines.join("\n") },
    nextIndex,
  };
}

function isFenceStart(line: string): boolean {
  return line.startsWith("```") || line.startsWith("~~~");
}

function isTableLine(line: string): boolean {
  return line.startsWith("|") && line.endsWith("|");
}

const stageOneSplitter = new MarkdownTextSplitter({
  headersToSplitOn: [
    ["#", "Header 1"],
    ["##", "Header 2"],
    ["###", "Header 3"],
  ],
});

const stageTwoSplitter = new RecursiveMarkdownTextSplitter({
  chunkSize: 120,
  chunkOverlap: 20,
});

const stageOneChunks = stageOneSplitter.splitText(sampleMarkdown);
const finalChunks: ChunkDocument[] = [];

for (const chunk of stageOneChunks) {
  const shouldSplit = chunk.pageContent.length > 120;

  if (!shouldSplit) {
    finalChunks.push({
      pageContent: chunk.pageContent,
      metadata: { ...chunk.metadata },
    });
    continue;
  }

  const subChunks = splitChunkPreservingTablesAndCode(
    chunk.pageContent,
    stageTwoSplitter,
  );

  for (const subChunk of subChunks) {
    finalChunks.push({
      pageContent: subChunk,
      metadata: { ...chunk.metadata },
    });
  }
}

console.log("Input markdown:\n");
console.log(sampleMarkdown);

printDocuments("Stage 1: Structural Markdown Chunks", stageOneChunks);
printDocuments("Final: Conditional RAG Chunks", finalChunks);
