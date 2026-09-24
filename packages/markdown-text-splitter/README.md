# markdown-text-splitter

Standalone TypeScript markdown text splitters inspired by LangChain's `markdown.py`.

## Exports

- `MarkdownTextSplitter`
- `RecursiveMarkdownTextSplitter`
- `RecursiveCharacterTextSplitter`
- `TextSplitter`
- `Language`
- `Document`

## Example

```ts
import { MarkdownTextSplitter, RecursiveMarkdownTextSplitter } from "markdown-text-splitter";

const markdown = `# Title

## Intro
Hello world

## Details
More text`;

const structural = new MarkdownTextSplitter();
const sectionDocs = structural.splitText(markdown);

const recursive = new RecursiveMarkdownTextSplitter({ chunkSize: 40 });
const chunks = recursive.splitText(sectionDocs[0].pageContent);
```
