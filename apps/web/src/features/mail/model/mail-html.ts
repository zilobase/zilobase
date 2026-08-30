import DOMPurify from "dompurify"

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

export function sanitizeMailHtml(
  html: string,
  sanitizer: (value: string) => string = (value) => DOMPurify.sanitize(value, {
    FORBID_TAGS: ["base", "embed", "form", "iframe", "meta", "object", "script"],
    USE_PROFILES: { html: true },
  }),
) {
  const document = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  )
  for (const unsafe of document.querySelectorAll("base, embed, form, iframe, meta, object, script")) unsafe.remove()
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name)
    }
  }
  for (const image of document.querySelectorAll("img")) {
    const source = image.getAttribute("src")?.trim() ?? ""
    if (/^https?:/i.test(source) || source.startsWith("//")) {
      image.removeAttribute("src")
      image.removeAttribute("srcset")
      image.setAttribute("data-zilobase-external-image", "blocked")
      image.setAttribute("alt", image.getAttribute("alt") || "External image blocked")
    }
  }
  for (const link of document.querySelectorAll("a")) {
    const href = link.getAttribute("href")?.trim()
    if (!href) continue
    try {
      const url = new URL(href, window.location.origin)
      if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) {
        link.removeAttribute("href")
        continue
      }
      link.setAttribute("href", url.toString())
      link.setAttribute("rel", "noopener noreferrer")
      link.setAttribute("target", "_blank")
    } catch {
      link.removeAttribute("href")
    }
  }
  const sanitized = sanitizer(document.body.innerHTML)
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:"><style>body{font:14px/1.6 system-ui,sans-serif;margin:0;color:CanvasText;background:Canvas}img[data-zilobase-external-image]{display:inline-block;min-width:10rem;min-height:1.5rem;border:1px dashed GrayText}</style></head><body>${sanitized}</body></html>`
}
