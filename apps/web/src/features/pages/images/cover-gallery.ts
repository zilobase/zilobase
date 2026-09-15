export type SolidCoverConfig = {
  color: string
  kind: "solid"
}

export type GradientCoverConfig = {
  angle: number
  endColor: string
  kind: "gradient"
  startColor: string
  style: "linear" | "radial"
}

export type DitherCoverConfig = {
  amplitude: number
  angle: number
  backgroundColor: string
  dotSize: number
  foregroundColor: string
  frequency: number
  kind: "dither"
}

export type CoverGalleryConfig =
  | SolidCoverConfig
  | GradientCoverConfig
  | DitherCoverConfig

export const defaultCoverGalleryConfig: CoverGalleryConfig = {
  angle: 135,
  endColor: "#8B5CF6",
  kind: "gradient",
  startColor: "#2563EB",
  style: "linear",
}

export const solidCoverPresets: SolidCoverConfig[] = [
  { color: "#1D4ED8", kind: "solid" },
  { color: "#0F766E", kind: "solid" },
  { color: "#7C3AED", kind: "solid" },
  { color: "#BE123C", kind: "solid" },
  { color: "#C2410C", kind: "solid" },
  { color: "#1F2937", kind: "solid" },
]

export const gradientCoverPresets: GradientCoverConfig[] = [
  { angle: 135, endColor: "#8B5CF6", kind: "gradient", startColor: "#2563EB", style: "linear" },
  { angle: 120, endColor: "#F97316", kind: "gradient", startColor: "#DB2777", style: "linear" },
  { angle: 145, endColor: "#14B8A6", kind: "gradient", startColor: "#0F172A", style: "linear" },
  { angle: 0, endColor: "#1E3A8A", kind: "gradient", startColor: "#67E8F9", style: "radial" },
]

export const ditherCoverPresets: DitherCoverConfig[] = [
  { amplitude: 30, angle: 18, backgroundColor: "#111827", dotSize: 2, foregroundColor: "#60A5FA", frequency: 4, kind: "dither" },
  { amplitude: 42, angle: 0, backgroundColor: "#2E1065", dotSize: 2, foregroundColor: "#F0ABFC", frequency: 6, kind: "dither" },
  { amplitude: 24, angle: 35, backgroundColor: "#042F2E", dotSize: 3, foregroundColor: "#5EEAD4", frequency: 3, kind: "dither" },
  { amplitude: 50, angle: 12, backgroundColor: "#431407", dotSize: 2, foregroundColor: "#FDBA74", frequency: 8, kind: "dither" },
]

export const coverGalleryPresets: CoverGalleryConfig[] = [
  ...solidCoverPresets,
  ...gradientCoverPresets,
  ...ditherCoverPresets,
]

const COVER_METADATA_ID = "zilobase-cover-gallery"
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

function color(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? value.toUpperCase()
    : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function normalizeCoverGalleryConfig(value: unknown): CoverGalleryConfig {
  if (!isRecord(value)) return defaultCoverGalleryConfig

  if (value.kind === "solid") {
    return {
      color: color(value.color, "#2563EB"),
      kind: "solid",
    }
  }

  if (value.kind === "dither") {
    return {
      amplitude: clamp(value.amplitude, 0, 80, 28),
      angle: clamp(value.angle, 0, 180, 18),
      backgroundColor: color(value.backgroundColor, "#111827"),
      dotSize: clamp(value.dotSize, 1, 5, 2),
      foregroundColor: color(value.foregroundColor, "#60A5FA"),
      frequency: clamp(value.frequency, 1, 10, 4),
      kind: "dither",
    }
  }

  if (value.kind === "gradient") {
    return {
      angle: clamp(value.angle, 0, 360, 135),
      endColor: color(value.endColor, "#8B5CF6"),
      kind: "gradient",
      startColor: color(value.startColor, "#2563EB"),
      style: value.style === "radial" ? "radial" : "linear",
    }
  }

  return defaultCoverGalleryConfig
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

function coverPaint(config: CoverGalleryConfig) {
  if (config.kind === "solid") {
    return `<rect width="1200" height="400" fill="${config.color}"/>`
  }

  if (config.kind === "gradient") {
    if (config.style === "radial") {
      return `<defs><radialGradient id="paint" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="${config.startColor}"/><stop offset="1" stop-color="${config.endColor}"/></radialGradient></defs><rect width="1200" height="400" fill="url(#paint)"/>`
    }

    return `<defs><linearGradient id="paint" x1="0" y1="0.5" x2="1" y2="0.5" gradientTransform="rotate(${config.angle} .5 .5)"><stop offset="0" stop-color="${config.startColor}"/><stop offset="1" stop-color="${config.endColor}"/></linearGradient></defs><rect width="1200" height="400" fill="url(#paint)"/>`
  }

  const horizontalFrequency = (0.002 + config.frequency * 0.0025).toFixed(4)
  const verticalFrequency = (0.006 + config.frequency * 0.003).toFixed(4)

  return `<defs><pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(${config.angle})"><circle cx="6" cy="6" r="${config.dotSize}" fill="${config.foregroundColor}"/></pattern><filter id="waves" x="-15%" y="-35%" width="130%" height="170%"><feTurbulence type="turbulence" baseFrequency="${horizontalFrequency} ${verticalFrequency}" numOctaves="1" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="${config.amplitude}" xChannelSelector="R" yChannelSelector="G"/></filter></defs><rect width="1200" height="400" fill="${config.backgroundColor}"/><rect x="-80" y="-80" width="1360" height="560" fill="url(#dots)" filter="url(#waves)"/>`
}

export function buildCoverGalleryDataUrl(value: CoverGalleryConfig) {
  const config = normalizeCoverGalleryConfig(value)
  const metadata = escapeXml(JSON.stringify(config))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice"><metadata id="${COVER_METADATA_ID}">${metadata}</metadata>${coverPaint(config)}</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function buildRandomCoverGalleryDataUrl(random = Math.random) {
  const index = Math.min(
    coverGalleryPresets.length - 1,
    Math.floor(random() * coverGalleryPresets.length),
  )

  return buildCoverGalleryDataUrl(coverGalleryPresets[index])
}

export function parseCoverGalleryDataUrl(value: string | null | undefined) {
  if (!value?.startsWith("data:image/svg+xml")) return null

  const separator = value.indexOf(",")
  if (separator === -1 || value.slice(0, separator).includes(";base64")) {
    return null
  }

  try {
    const svg = decodeURIComponent(value.slice(separator + 1))
    const metadata = svg.match(
      new RegExp(`<metadata id="${COVER_METADATA_ID}">([^<]+)</metadata>`),
    )?.[1]

    if (!metadata) return null
    return normalizeCoverGalleryConfig(JSON.parse(unescapeXml(metadata)))
  } catch {
    return null
  }
}
