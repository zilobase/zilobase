import {
  FileImage,
  Image as ImageIcon,
  Link,
  Loader2,
  Palette,
  Search,
  Upload,
} from "@/shared/components/icons"
import { useRef, useState } from "react"

import { Button } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"
import { getApiErrorMessage } from "@/platform/network/api"
import { uploadPageImage } from "@/platform/network/image-upload"
import { CoverGalleryPicker } from "./cover-gallery-picker"

type ImageSourcePickerProps = {
  className?: string
  databaseId?: string | null
  enableCoverGallery?: boolean
  initialCover?: string
  initialLinkUrl?: string
  onGalleryChange?: (url: string) => void
  onSelect: (url: string) => void
  workspaceId?: string | null
  pageId?: string | null
}

export function ImageSourcePicker({
  className,
  databaseId,
  enableCoverGallery = false,
  initialCover,
  initialLinkUrl = "",
  onGalleryChange,
  onSelect,
  workspaceId,
  pageId,
}: ImageSourcePickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const readFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      return
    }

    setUploadError(null)

    if (workspaceId && pageId) {
      setIsUploading(true)

      try {
        const uploaded = await uploadPageImage({
          databaseId,
          file,
          workspaceId,
          pageId,
        })

        onSelect(uploaded.url)
      } catch (error) {
        setUploadError(getApiErrorMessage(error))
      } finally {
        setIsUploading(false)
      }

      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        onSelect(reader.result)
      }
    }

    reader.readAsDataURL(file)
  }

  const submitLink = () => {
    const nextUrl = linkUrl.trim()

    if (nextUrl) {
      onSelect(nextUrl)
    }
  }

  return (
    <Tabs
      className={className ?? "gap-4"}
      defaultValue={enableCoverGallery ? "gallery" : "upload"}
    >
      <TabsList>
        {enableCoverGallery ? (
          <TabsTrigger value="gallery">
            <Palette />
            Gallery
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="upload">Upload</TabsTrigger>
        <TabsTrigger value="link">Link</TabsTrigger>
        <TabsTrigger value="unsplash">
          <Upload />
          Unsplash
        </TabsTrigger>
        <TabsTrigger value="giphy">
          <FileImage />
          GIPHY
        </TabsTrigger>
      </TabsList>

      {enableCoverGallery ? (
        <TabsContent value="gallery">
          <CoverGalleryPicker
            initialCover={initialCover}
            onChange={onGalleryChange ?? onSelect}
          />
        </TabsContent>
      ) : null}

      <TabsContent className="space-y-4" value="upload">
        <Button
          className="h-40 w-full flex-col gap-2 border-dashed"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
          }}
          onDrop={(event) => {
            event.preventDefault()
            readFile(event.dataTransfer.files[0])
          }}
          size="lg"
          type="button"
          variant="outline"
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <ImageIcon />}
          <span>{isUploading ? "Uploading image" : "Upload image"}</span>
          <span className="text-content-secondary">Or drag and drop here</span>
        </Button>
        {uploadError ? (
          <div className="text-sm text-action-danger-text">{uploadError}</div>
        ) : null}
        <input
          accept="image/*"
          className="sr-only"
          onChange={(event) => readFile(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />

      </TabsContent>

      <TabsContent className="space-y-3" value="link">
        <div className="flex items-center gap-2">
          <Link className="size-4 text-content-secondary" />
          <Input
            autoComplete="off"
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                submitLink()
              }
            }}
            placeholder="Paste image URL..."
            value={linkUrl}
          />
          <Button onClick={submitLink} type="button">
            Add
          </Button>
        </div>
      </TabsContent>

      <TabsContent className="space-y-3" value="unsplash">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-content-secondary" />
          <Input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Unsplash..."
            value={searchQuery}
          />
        </div>
        <Card>
          <CardContent className="py-8 text-center text-content-secondary">
            Unsplash search is ready for an API key.
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent className="space-y-3" value="giphy">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-content-secondary" />
          <Input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search GIPHY..."
            value={searchQuery}
          />
        </div>
        <Card>
          <CardContent className="py-8 text-center text-content-secondary">
            GIPHY search is ready for an API key.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
