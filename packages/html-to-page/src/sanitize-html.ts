import { isAllowedEmbedSrc, isAllowedHttpUrl, isAllowedImageUrl } from "./safe-url";

const removedTags = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "link",
  "meta",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
]);

export function sanitizeHtml(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  );
  const body = document.body;
  if (!body) return "";
  sanitizeElement(body);
  return body.innerHTML.trim();
}

function sanitizeElement(root: Element) {
  const walker = Array.from(root.querySelectorAll("*"));

  for (const element of walker) {
    const tagName = element.tagName.toLowerCase();

    sanitizeHtmlElement(element, tagName);
  }
}

function sanitizeHtmlElement(element: Element, tagName: string) {
  if (tagName === "iframe") {
    sanitizeIframe(element);
    return;
  }

  if (removedTags.has(tagName)) {
    element.remove();
    return;
  }

  stripEventHandlers(element);

  if (tagName === "a") {
    const href = element.getAttribute("href");
    if (!isAllowedHttpUrl(href)) {
      unwrap(element);
    }
    return;
  }

  if (tagName === "img") {
    const src = element.getAttribute("src");
    if (!isAllowedImageUrl(src)) {
      element.remove();
    }
    return;
  }

  if (tagName === "video") {
    const src = element.getAttribute("src");
    if (!isAllowedHttpUrl(src)) {
      element.remove();
    }
  }
}

function sanitizeIframe(element: Element) {
  const src = element.getAttribute("src");
  if (!isAllowedEmbedSrc(src)) {
    element.remove();
    return;
  }
  stripEventHandlers(element);
  keepAttributes(element, ["src", "title", "width", "height", "allowfullscreen"]);
  return;
}

function stripEventHandlers(element: Element) {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith("on") || attribute.name === "srcdoc") {
      element.removeAttribute(attribute.name);
    }
  }
}

function keepAttributes(element: Element, names: string[]) {
  const allowed = new Set(names);
  for (const attribute of Array.from(element.attributes)) {
    if (!allowed.has(attribute.name)) {
      element.removeAttribute(attribute.name);
    }
  }
}

function unwrap(element: Element) {
  const parent = element.parentNode;
  if (!parent) {
    element.remove();
    return;
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  element.remove();
}
