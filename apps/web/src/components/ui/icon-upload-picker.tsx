import * as React from "react"
import { Upload } from "lucide-react"

import { IconColorGrid } from "@/components/ui/icon-color-grid"
import { IconSvgPreview } from "@/components/ui/icon-svg-preview"
import { cn } from "@/lib/utils"
import {
  buildColoredIconSvg,
  parseUploadedSvg,
} from "@/lib/workspace-icon-utils"

type IconUploadPickerProps = {
  className?: string
  onIconSelect: (svg: string) => void
}

type UploadedIcon = {
  viewBox: string
  content: string
}

export function IconUploadPicker({
  className,
  onIconSelect,
}: IconUploadPickerProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [uploadedIcon, setUploadedIcon] = React.useState<UploadedIcon | null>(
    null,
  )

  const loadSvgFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".svg") && file.type !== "image/svg+xml") {
      setError("Upload an SVG file.")
      return
    }

    const text = await file.text()
    const parsed = parseUploadedSvg(text)

    if (!parsed) {
      setError("Could not read this SVG.")
      return
    }

    setError(null)
    setUploadedIcon(parsed)
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]

    if (!file) {
      return
    }

    void loadSvgFile(file)
  }

  return (
    <div
      className={cn(
        "isolate flex h-[342px] w-72 flex-col bg-popover text-popover-foreground",
        className,
      )}
    >
      <input
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ""
        }}
        ref={inputRef}
        type="file"
      />

      {!uploadedIcon ? (
        <>
          <button
            className={cn(
              "mx-2 mt-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
              dragActive
                ? "border-ring bg-muted/60"
                : "border-border/80 bg-muted/20 hover:bg-muted/40",
            )}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragActive(false)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              handleFiles(event.dataTransfer.files)
            }}
            type="button"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Upload className="size-5 text-muted-foreground" />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-medium">
                Drop an SVG here
              </span>
              <span className="block text-xs text-muted-foreground">
                or click to upload
              </span>
            </span>
          </button>
          {error ? (
            <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
          ) : (
            <div className="flex h-10 items-center border-t px-3 text-xs text-muted-foreground">
              Upload a custom icon
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Choose a color</p>
            <button
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setUploadedIcon(null)
                setError(null)
              }}
              type="button"
            >
              Replace
            </button>
          </div>
          <div className="mt-4 flex justify-center">
            <span className="flex size-16 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
              <IconSvgPreview
                content={uploadedIcon.content}
                size={40}
                viewBox={uploadedIcon.viewBox}
              />
            </span>
          </div>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
            <IconColorGrid
              columns={5}
              content={uploadedIcon.content}
              onSelect={(colorValue) => {
                onIconSelect(
                  buildColoredIconSvg({
                    viewBox: uploadedIcon.viewBox,
                    content: uploadedIcon.content,
                    color: colorValue,
                  }),
                )
              }}
              previewSize={28}
              viewBox={uploadedIcon.viewBox}
            />
          </div>
        </div>
      )}
    </div>
  )
}
