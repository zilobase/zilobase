import { parseHTML } from "linkedom";

export function ensureDomParser() {
  if (typeof globalThis.DOMParser === "function") {
    return;
  }
  installDomParser();
}

export function installDomParser() {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const runtime = globalThis as typeof globalThis & {
    document: Document;
    window: Window & typeof globalThis;
  };
  runtime.document = document as unknown as Document;
  runtime.window = window as unknown as Window & typeof globalThis;
  runtime.Node = (window.Node ?? { TEXT_NODE: 3, ELEMENT_NODE: 1 }) as typeof Node;
  runtime.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
  runtime.Element = window.Element as unknown as typeof Element;
  runtime.DOMParser = class DOMParser {
    parseFromString(html: string, type: DOMParserSupportedType) {
      if (type !== "text/html") {
        throw new Error(`Unsupported DOMParser type: ${type}`);
      }
      return parseHTML(`<!doctype html>${html}`).document as unknown as Document;
    }
  } as unknown as typeof DOMParser;
}
