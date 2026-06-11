import { File as FileIcon, Link as LinkIcon, Plus, X } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type FilesLimitValue = "one_file" | "no_limit"

export function DatabasePropertyFiles({
  editable = true,
  label,
  onOpenChange,
  onSelect,
  propertyConfig,
  value,
}: {
  editable?: boolean
  label: string
  onOpenChange?: (open: boolean) => void
  onSelect: (value: string | string[]) => void
  propertyConfig?: unknown
  value: string | string[]
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const filesLimit = getFilesLimit(propertyConfig)
  const files = getFilesValue(value)

  const setOpen = (open: boolean) => {
    setIsOpen(open)
    onOpenChange?.(open)

    if (!open) {
      setLinkUrl("")
    }
  }

  const commitFiles = (nextFiles: string[]) => {
    onSelect(filesLimit === "one_file" ? (nextFiles[0] ?? "") : nextFiles)
    setOpen(false)
  }

  const addFile = (nextFileValue: string) => {
    const normalizedValue = nextFileValue.trim()

    if (!normalizedValue) {
      return
    }

    const nextFiles =
      filesLimit === "one_file"
        ? [normalizedValue]
        : [...files.filter((file) => file !== normalizedValue), normalizedValue]

    commitFiles(nextFiles)
  }

  const removeFile = (fileValue: string) => {
    const nextFiles = files.filter((file) => file !== fileValue)

    onSelect(filesLimit === "one_file" ? (nextFiles[0] ?? "") : nextFiles)
  }

  const readFile = (file: File | undefined) => {
    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        addFile(reader.result)
      }
    }

    reader.readAsDataURL(file)
  }

  const submitLink = () => addFile(linkUrl)

  const triggerContent = files.length > 0 ? (
    files.map((file) => (
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-background px-2 py-0.5 text-xs font-normal leading-4 text-foreground"
        key={file}
      >
        <FileIcon className="size-3.5 shrink-0" />
        <span className="truncate">{getFileLabel(file)}</span>
      </span>
    ))
  ) : isOpen ? (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Plus className="size-4 shrink-0" />
      <span>Add a file or image</span>
    </span>
  ) : (
    <span aria-hidden="true" className="block min-h-5 w-full" />
  )

  if (!editable) {
    return files.length > 0 ? (
      <div className="database-select-cell-trigger">
        {files.map((file) => {
          const href = getFileHref(file)

          return (
            <a
              className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-background px-2 py-0.5 text-xs font-normal leading-4 text-foreground no-underline transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
              href={href}
              key={file}
              onClick={(event) => event.stopPropagation()}
              rel="noreferrer"
              target="_blank"
            >
              <FileIcon className="size-3.5 shrink-0" />
              <span className="truncate">{getFileLabel(file)}</span>
            </a>
          )
        })}
      </div>
    ) : (
      <span className="database-select-cell-trigger">
        <span aria-hidden="true" className="block min-h-5 w-full" />
      </span>
    )
  }

  return (
    <Popover onOpenChange={setOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${label} value`}
          className="database-select-cell-trigger"
          type="button"
        >
          {triggerContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0"
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        sideOffset={0}
      >
        <Tabs defaultValue="upload">
          <TabsList
            className="w-full justify-start rounded-none border-b px-2"
            variant="line"
          >
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="link">Link</TabsTrigger>
          </TabsList>
          <TabsContent className="space-y-3 p-3" value="upload">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Upload</div>
              <div className="text-xs text-muted-foreground">
                Choose a file or image for this cell.
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              Choose a file
            </Button>
            <input
              className="sr-only"
              onChange={(event) => {
                readFile(event.target.files?.[0])
                event.target.value = ""
              }}
              ref={fileInputRef}
              type="file"
            />
          </TabsContent>
          <TabsContent className="space-y-3 p-3" value="link">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">Link</div>
              <div className="text-xs text-muted-foreground">
                Paste a public file URL.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
              <Input
                autoComplete="off"
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    submitLink()
                  }
                }}
                placeholder="Paste file URL..."
                value={linkUrl}
              />
              <Button onClick={submitLink} size="sm" type="button">
                Add
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {files.length > 0 ? (
          <div className="border-t p-2">
            {files.map((file) => {
              const href = getFileHref(file)

              return (
                <div
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  key={file}
                >
                  <a
                    className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground no-underline"
                    href={href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{getFileLabel(file)}</span>
                  </a>
                  <button
                    aria-label={`Remove ${getFileLabel(file)}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                    onClick={() => removeFile(file)}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export { DatabasePropertyFiles as DatabaseFilesCell }

function getFilesLimit(config: unknown): FilesLimitValue {
  if (
    config &&
    typeof config === "object" &&
    "filesLimit" in config &&
    (config as { filesLimit?: unknown }).filesLimit === "one_file"
  ) {
    return "one_file"
  }

  return "no_limit"
}

function getFilesValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.filter(
      (file): file is string => typeof file === "string" && file.trim().length > 0
    )
  }

  return value.trim() ? [value.trim()] : []
}

function getFileHref(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue || trimmedValue.startsWith("data:")) {
    return trimmedValue
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmedValue)
  const href = hasProtocol ? trimmedValue : `https://${trimmedValue}`

  try {
    return new URL(href).href
  } catch {
    return trimmedValue
  }
}

function getFileLabel(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return "File"
  }

  if (trimmedValue.startsWith("data:")) {
    const mimeType = trimmedValue.slice(5, trimmedValue.indexOf(";"))

    return mimeType.startsWith("image/") ? "Uploaded image" : "Uploaded file"
  }

  const href = getFileHref(trimmedValue)

  try {
    const url = new URL(href)
    const segments = url.pathname.split("/").filter(Boolean)
    const fileName = segments[segments.length - 1]

    return fileName ? decodeURIComponent(fileName) : url.hostname
  } catch {
    return trimmedValue
  }
}
