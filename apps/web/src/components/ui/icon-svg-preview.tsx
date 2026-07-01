import { cn } from "@/lib/utils"

export function IconSvgPreview({
  className,
  content,
  fill = "currentColor",
  size = 20,
  viewBox = "0 0 24 24",
}: {
  className?: string
  content: string
  fill?: string
  size?: number
  viewBox?: string
}) {
  return (
    <svg
      aria-hidden
      className={cn("shrink-0", className)}
      fill={fill}
      height={size}
      viewBox={viewBox}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
