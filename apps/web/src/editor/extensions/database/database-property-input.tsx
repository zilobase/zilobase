import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getColorToken } from "@/lib/color-tokens"

import {
  getNumberDecimalPlaces,
  getNumberDisplayColor,
  getNumberDisplayDivideBy,
  getNumberDisplayShowNumber,
  getNumberDisplayStyle,
  getNumberFormat,
} from "./shared/database-view-config"

export function DatabaseInputCell({
  editable = true,
  label,
  onActivate = () => {},
  onChange,
  onCommit,
  onDeactivate = () => {},
  onInput = () => {},
  propertyConfig,
  type,
  value,
}: {
  editable?: boolean
  label: string
  onActivate?: (element: HTMLTextAreaElement) => void
  onChange: (value: string) => void
  onCommit: () => void
  onDeactivate?: () => void
  onInput?: (event: FormEvent<HTMLTextAreaElement>) => void
  propertyConfig?: unknown
  type: string
  value: string
  wrapContent?: boolean
}) {
  const errorId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const skipNextBlurCommitRef = useRef(false)
  const isNumberCell = type === "number"
  const hasNumberError =
    isNumberCell && value.trim() !== "" && !isValidNumber(value)
  const errorMessage = hasNumberError ? "Enter a valid number" : null
  const actionHref = getActionHref(type, value)
  const actionLinkProps = getActionLinkProps(type)
  const displayValue = getDisplayValue(type, value, propertyConfig)

  useLayoutEffect(() => {
    const element = textareaRef.current

    if (!element || !isOpen) {
      return
    }

    resizeTextarea(element)
  }, [isOpen, value])

  if (!editable) {
    return actionHref ? (
      <a
        className="database-input-cell-link"
        href={actionHref}
        onClick={(event) => event.stopPropagation()}
        {...actionLinkProps}
      >
        {displayValue}
      </a>
    ) : (
      <span className="database-input-cell-trigger">{displayValue}</span>
    )
  }

  const resizeTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }

  const resetTextareaView = (element: HTMLTextAreaElement) => {
    resizeTextarea(element)
    element.scrollTop = 0
    element.scrollLeft = 0
  }

  const commitAndClose = () => {
    onCommit()
    onDeactivate()
    setIsOpen(false)
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          setIsOpen(true)
          return
        }

        commitAndClose()
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={`${label} value`}
          className="database-input-cell-trigger"
          type="button"
        >
          {actionHref ? (
            <a
              className="database-input-cell-link"
              href={actionHref}
              onClick={(event) => event.stopPropagation()}
              {...actionLinkProps}
            >
              {displayValue}
            </a>
          ) : (
            displayValue
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="database-input-cell-popover w-72 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          requestAnimationFrame(() => {
            const element = textareaRef.current

            if (!element) {
              return
            }

            element.focus()
            element.setSelectionRange(element.value.length, element.value.length)
            resizeTextarea(element)
            onActivate(element)
          })
        }}
        sideOffset={0}
      >
        <div className="database-input-cell-wrap" data-popover-open="true">
          <textarea
            aria-describedby={errorMessage ? errorId : undefined}
            aria-invalid={hasNumberError ? "true" : undefined}
            aria-label={`${label} value`}
            className="database-input-cell"
            data-database-cell-input
            onBlur={() => {
              if (skipNextBlurCommitRef.current) {
                skipNextBlurCommitRef.current = false
              }
            }}
            onChange={(event) =>
              onChange(stripActionScheme(type, event.target.value))
            }
            onFocus={(event) => onActivate(event.currentTarget)}
            onInput={(event) => {
              onInput(event)
              resizeTextarea(event.currentTarget)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                commitAndClose()
                return
              }

              if (event.key !== "Enter" || event.shiftKey) {
                return
              }

              event.preventDefault()
              resetTextareaView(event.currentTarget)
              commitAndClose()
              skipNextBlurCommitRef.current = true
            }}
            ref={textareaRef}
            rows={1}
            value={value}
            wrap="soft"
          />
          {errorMessage ? (
            <div className="database-input-cell-error" id={errorId}>
              {errorMessage}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { DatabaseInputCell as DatabasePropertyInput }

function isValidNumber(value: string) {
  return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())
}

function getActionHref(type: string, value: string) {
  const displayValue = stripActionScheme(type, value).trim()

  if (!displayValue) {
    return null
  }

  if (type === "email") {
    return `mailto:${displayValue}`
  }

  if (type === "phone") {
    return `tel:${displayValue}`
  }

  if (type === "url") {
    return getUrlHref(displayValue)
  }

  return null
}

function getUrlHref(value: string) {
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value)
  const href = hasProtocol ? value : `https://${value}`

  try {
    const url = new URL(href)

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null
  } catch {
    return null
  }
}

function getActionLinkProps(type: string) {
  if (type !== "url") {
    return {}
  }

  return {
    rel: "noreferrer",
    target: "_blank",
  }
}

function getDisplayValue(type: string, value: string, config: unknown) {
  const displayValue = stripActionScheme(type, value)

  if (type === "number") {
    return getNumberDisplayValue(displayValue, config)
  }

  if (type !== "url" || getShowFullUrl(config)) {
    return displayValue
  }

  const href = getUrlHref(displayValue.trim())

  if (!href) {
    return displayValue
  }

  const url = new URL(href)
  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")

  return `${url.hostname}${pathname}`
}

export function getNumberDisplayValue(value: string, config: unknown): ReactNode {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return ""
  }

  if (!isValidNumber(trimmedValue)) {
    return value
  }

  const numberValue = Number(trimmedValue)

  if (!Number.isFinite(numberValue)) {
    return value
  }

  const formattedValue = formatNumberValue(trimmedValue, numberValue, config)
  const displayStyle = getNumberDisplayStyle(config)

  if (displayStyle === "number") {
    return formattedValue
  }

  const divideBy = getNumberDisplayDivideBy(config)
  const ratio = Math.max(0, Math.min(1, divideBy === 0 ? 0 : numberValue / divideBy))
  const showNumber = getNumberDisplayShowNumber(config)
  const colorToken = getColorToken(getNumberDisplayColor(config))

  if (displayStyle === "bar") {
    return (
      <span className="flex w-full min-w-0 items-center justify-between gap-3">
        {showNumber ? (
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {formattedValue}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="h-2 w-22 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className={`block h-full rounded-full bg-current ${colorToken.textClass}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
      </span>
    )
  }

  const circumference = 2 * Math.PI * 8
  const strokeDashoffset = circumference * (1 - ratio)

  return (
    <span className="flex w-full min-w-0 items-center justify-between gap-3">
      {showNumber ? (
        <span className="min-w-0 flex-1 truncate tabular-nums">{formattedValue}</span>
      ) : (
        <span className="flex-1" />
      )}
      <span className={`relative inline-flex size-8 shrink-0 ${colorToken.textClass}`}>
        <svg aria-hidden="true" className="size-6" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            fill="none"
            r="8"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="3"
          />
          <circle
            cx="12"
            cy="12"
            fill="none"
            r="8"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth="3"
            transform="rotate(-90 12 12)"
          />
        </svg>
      </span>
    </span>
  )
}

function formatNumberValue(value: string, numberValue: number, config: unknown) {
  const numberFormat = getNumberFormat(config).trim().toLowerCase()
  const decimalPlaces = getNumberDecimalPlaces(config)
  const options: Intl.NumberFormatOptions = {
    useGrouping: numberFormat !== "number",
  }
  const currencyCode = getNumberCurrencyCode(numberFormat)

  if (decimalPlaces !== "default") {
    options.minimumFractionDigits = decimalPlaces
    options.maximumFractionDigits = decimalPlaces
  }

  if (numberFormat === "number" && decimalPlaces === "default") {
    return value
  }

  if (numberFormat === "percent") {
    options.style = "percent"
  } else if (currencyCode) {
    options.currency = currencyCode
    options.style = "currency"
  }

  return new Intl.NumberFormat(undefined, options).format(numberValue)
}

function getNumberCurrencyCode(format: string) {
  const normalizedFormat = format.toUpperCase()

  return /^[A-Z]{3}$/.test(normalizedFormat) ? normalizedFormat : null
}

function getShowFullUrl(config: unknown) {
  return (
    config !== null &&
    typeof config === "object" &&
    "showFullUrl" in config &&
    (config as { showFullUrl?: unknown }).showFullUrl === true
  )
}

function stripActionScheme(type: string, value: string) {
  if (type === "email") {
    return value.replace(/^mailto:/i, "")
  }

  if (type === "phone") {
    return value.replace(/^tel:/i, "")
  }

  return value
}
