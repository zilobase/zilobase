import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatabaseInputCell({
  editable = true,
  label,
  onActivate,
  onChange,
  onCommit,
  onDeactivate,
  onInput,
  propertyConfig,
  type,
  value,
}: {
  editable?: boolean
  label: string
  onActivate: (element: HTMLTextAreaElement) => void
  onChange: (value: string) => void
  onCommit: () => void
  onDeactivate: () => void
  onInput: (event: FormEvent<HTMLTextAreaElement>) => void
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
      <span className="database-input-cell-trigger">
        {displayValue || <span className="text-muted-foreground">Empty</span>}
      </span>
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
          {displayValue || (
            <span className="text-muted-foreground">Empty</span>
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
