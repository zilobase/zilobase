import {
  FileImage,
  Image as ImageIcon,
  Link,
  Loader2,
  Search,
  Sparkles,
  Upload,
} from "lucide-react"
import { useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getApiErrorMessage } from "@/lib/api"
import { uploadPageImage } from "@/lib/image-upload"

const aiImageOptions = [
  { label: "Photo", icon: ImageIcon },
  { label: "Slides", icon: FileImage },
  { label: "Diagram", icon: Sparkles },
  { label: "Chart", icon: Sparkles },
  { label: "Mockup", icon: FileImage },
]

type ImageSourcePickerProps = {
  className?: string
  databaseId?: string | null
  initialLinkUrl?: string
  onSelect: (url: string) => void
  workspaceId?: string | null
  pageId?: string | null
}

export function ImageSourcePicker({
  className,
  databaseId,
  initialLinkUrl = "",
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
    <Tabs className={className ?? "gap-4"} defaultValue="add">
      <TabsList>
        <TabsTrigger value="add">Add</TabsTrigger>
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

      <TabsContent className="space-y-4" value="add">
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
          <span className="text-muted-foreground">Or drag and drop here</span>
        </Button>
        {uploadError ? (
          <div className="text-sm text-destructive">{uploadError}</div>
        ) : null}
        <input
          accept="image/*"
          className="sr-only"
          onChange={(event) => readFile(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />

        <Card>
          <CardHeader>
            <CardTitle>Create with AI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {aiImageOptions.map((option) => (
                <Button
                  className="h-20 flex-col"
                  key={option.label}
                  type="button"
                  variant="outline"
                >
                  <option.icon />
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border p-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <Input
                className="border-0 bg-transparent focus-visible:ring-0"
                placeholder="Or describe your idea..."
              />
              <Badge variant="secondary">Beta</Badge>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent className="space-y-3" value="link">
        <div className="flex items-center gap-2">
          <Link className="size-4 text-muted-foreground" />
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
          <Search className="size-4 text-muted-foreground" />
          <Input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search Unsplash..."
            value={searchQuery}
          />
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Unsplash search is ready for an API key.
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent className="space-y-3" value="giphy">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search GIPHY..."
            value={searchQuery}
          />
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            GIPHY search is ready for an API key.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}