import DOMPurify from "dompurify"

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"])
const SAFE_MAIL_URI = /^(?:(?:https?|mailto|cid|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

export function sanitizeMailHtml(
  html: string,
  options: { inlineImageUrls?: Readonly<Record<string, string>>; loadExternalImages?: boolean } = {},
  sanitizer: (value: string) => string = (value) => DOMPurify.sanitize(value, {
    ALLOWED_URI_REGEXP: SAFE_MAIL_URI,
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
    if (/^cid:/i.test(source)) {
      const contentId = decodeURIComponent(source.slice(4)).replace(/^<|>$/g, "")
      const objectUrl = options.inlineImageUrls?.[contentId]
      if (objectUrl) {
        image.setAttribute("src", objectUrl)
        image.setAttribute("data-zilobase-inline-image", "loaded")
      } else {
        image.removeAttribute("src")
        image.setAttribute("data-zilobase-inline-image", "unavailable")
        image.setAttribute("alt", image.getAttribute("alt") || "Inline image unavailable")
      }
      image.removeAttribute("srcset")
      continue
    }
    if (/^https?:/i.test(source) || source.startsWith("//")) {
      if (options.loadExternalImages && (/^https:/i.test(source) || source.startsWith("//"))) {
        image.setAttribute("src", source.startsWith("//") ? `https:${source}` : source)
        image.removeAttribute("srcset")
        continue
      }
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
  const imageSources = options.loadExternalImages ? "data: blob: https:" : "data: blob:"
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imageSources}; style-src 'unsafe-inline'; font-src data:"><style>html,body{min-height:0}body{font:14px/1.6 system-ui,sans-serif;margin:0;color:CanvasText;background:Canvas;overflow:hidden}img{max-width:100%;height:auto}img[data-zilobase-external-image],img[data-zilobase-inline-image=unavailable]{display:inline-block;min-width:10rem;min-height:1.5rem;border:1px dashed GrayText}</style></head><body>${sanitized}</body></html>`
}
