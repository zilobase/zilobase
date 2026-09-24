import { Language, type TextSplitterOptions } from "./types.js";
import { TextSplitter } from "./text-splitter.js";

export interface CharacterTextSplitterOptions extends TextSplitterOptions {
  separator?: string;
  isSeparatorRegex?: boolean;
}

export class CharacterTextSplitter extends TextSplitter {
  protected readonly separator: string;
  protected readonly isSeparatorRegex: boolean;

  public constructor(options: CharacterTextSplitterOptions = {}) {
    const { separator = "\n\n", isSeparatorRegex = false, ...textSplitterOptions } = options;
    super(textSplitterOptions);
    this.separator = separator;
    this.isSeparatorRegex = isSeparatorRegex;
  }

  public splitText(text: string): string[] {
    const separatorPattern = this.isSeparatorRegex ? this.separator : escapeRegExp(this.separator);

    const splits = splitTextWithRegex(text, separatorPattern, this.keepSeparator);

    const lookaroundPrefixes = ["(?=", "(?<!", "(?<=", "(?!"];
    const isLookaround =
      this.isSeparatorRegex &&
      lookaroundPrefixes.some((prefix) => this.separator.startsWith(prefix));

    const mergeSeparator = !this.keepSeparator && !isLookaround ? this.separator : "";
    return this.mergeSplits(splits, mergeSeparator);
  }
}

export interface RecursiveCharacterTextSplitterOptions extends TextSplitterOptions {
  separators?: string[];
  keepSeparator?: boolean | "start" | "end";
  isSeparatorRegex?: boolean;
}

export class RecursiveCharacterTextSplitter extends TextSplitter {
  protected readonly separators: string[];
  protected readonly isSeparatorRegex: boolean;

  public constructor(options: RecursiveCharacterTextSplitterOptions = {}) {
    const {
      separators = ["\n\n", "\n", " ", ""],
      keepSeparator = true,
      isSeparatorRegex = false,
      ...textSplitterOptions
    } = options;

    super({
      ...textSplitterOptions,
      keepSeparator,
    });

    this.separators = separators;
    this.isSeparatorRegex = isSeparatorRegex;
  }

  public splitText(text: string): string[] {
    return this.splitTextRecursive(text, this.separators);
  }

  public static fromLanguage(
    language: Language,
    options: Omit<RecursiveCharacterTextSplitterOptions, "separators" | "isSeparatorRegex"> = {},
  ): RecursiveCharacterTextSplitter {
    return new RecursiveCharacterTextSplitter({
      ...options,
      separators: RecursiveCharacterTextSplitter.getSeparatorsForLanguage(language),
      isSeparatorRegex: true,
    });
  }

  public static getSeparatorsForLanguage(language: Language): string[] {
    if (language === Language.MARKDOWN) {
      return [
        "\n#{1,6} ",
        "```\n",
        "\n\\*\\*\\*+\n",
        "\n---+\n",
        "\n___+\n",
        "\n\n",
        "\n",
        " ",
        "",
      ];
    }

    throw new Error(`Language "${language}" is not implemented.`);
  }

  protected splitTextRecursive(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];
    let separator = separators[separators.length - 1] ?? "";
    let nextSeparators: string[] = [];

    for (const [index, candidate] of separators.entries()) {
      const separatorPattern = this.isSeparatorRegex ? candidate : escapeRegExp(candidate);

      if (!candidate) {
        separator = candidate;
        break;
      }

      if (new RegExp(separatorPattern).test(text)) {
        separator = candidate;
        nextSeparators = separators.slice(index + 1);
        break;
      }
    }

    const separatorPattern = this.isSeparatorRegex ? separator : escapeRegExp(separator);
    const splits = splitTextWithRegex(text, separatorPattern, this.keepSeparator);
    const mergeSeparator = this.keepSeparator ? "" : separator;
    let goodSplits: string[] = [];

    for (const split of splits) {
      if (this.lengthFunction(split) < this.chunkSize) {
        goodSplits.push(split);
        continue;
      }

      if (goodSplits.length > 0) {
        finalChunks.push(...this.mergeSplits(goodSplits, mergeSeparator));
        goodSplits = [];
      }

      if (nextSeparators.length === 0) {
        finalChunks.push(split);
      } else {
        finalChunks.push(...this.splitTextRecursive(split, nextSeparators));
      }
    }

    if (goodSplits.length > 0) {
      finalChunks.push(...this.mergeSplits(goodSplits, mergeSeparator));
    }

    return finalChunks;
  }
}

export function splitTextWithRegex(
  text: string,
  separator: string,
  keepSeparator: boolean | "start" | "end",
): string[] {
  let splits: string[];

  if (separator) {
    if (keepSeparator) {
      const splitParts = text.split(new RegExp(`(${separator})`));
      splits =
        keepSeparator === "end"
          ? pairWithEndingSeparator(splitParts)
          : pairWithStartingSeparator(splitParts);

      if (splitParts.length % 2 === 0) {
        splits = [...splits, splitParts[splitParts.length - 1]];
      }

      splits =
        keepSeparator === "end"
          ? [...splits, splitParts[splitParts.length - 1]]
          : [splitParts[0], ...splits];
    } else {
      splits = text.split(new RegExp(separator));
    }
  } else {
    splits = Array.from(text);
  }

  return splits.filter(Boolean);
}

function pairWithEndingSeparator(parts: string[]): string[] {
  const result: string[] = [];

  for (let index = 0; index < parts.length - 1; index += 2) {
    result.push(parts[index] + parts[index + 1]);
  }

  return result;
}

function pairWithStartingSeparator(parts: string[]): string[] {
  const result: string[] = [];

  for (let index = 1; index < parts.length; index += 2) {
    result.push(parts[index] + (parts[index + 1] ?? ""));
  }

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
