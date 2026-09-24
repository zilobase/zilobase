import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp } from "@/shared/components/icons"

import { Button } from "@/shared/ui/button"
import { ButtonGroup } from "@/shared/ui/button-group"

type MobileActionBarProps = {
  canMoveDown: boolean
  canMoveUp: boolean
  onMoveDown: () => void
  onMoveUp: () => void
}

export function MobileActionBar({
  canMoveDown,
  canMoveUp,
  onMoveDown,
  onMoveUp,
}: MobileActionBarProps) {
  const [bottom, setBottom] = useState(12)

  useEffect(() => {
    const updateBottom = () => {
      const viewport = window.visualViewport

      if (!viewport) {
        setBottom(12)
        return
      }

      const keyboardHeight = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop
      )

      setBottom(keyboardHeight + 12)
    }

    updateBottom()
    window.visualViewport?.addEventListener("resize", updateBottom)
    window.visualViewport?.addEventListener("scroll", updateBottom)
    window.addEventListener("resize", updateBottom)

    return () => {
      window.visualViewport?.removeEventListener("resize", updateBottom)
      window.visualViewport?.removeEventListener("scroll", updateBottom)
      window.removeEventListener("resize", updateBottom)
    }
  }, [])

  return (
    <ButtonGroup
      aria-label="Block movement actions"
      className="fixed left-1/2 z-50 -translate-x-1/2 md:hidden"
      data-mobile-action-bar
      density="compact"
      role="toolbar"
      style={{
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`,
      }}
      variant="floating"
    >
      <Button
        aria-label="Move block up"
        disabled={!canMoveUp}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onMoveUp()
        }}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <ArrowUp />
      </Button>
      <Button
        aria-label="Move block down"
        disabled={!canMoveDown}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onMoveDown()
        }}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <ArrowDown />
      </Button>
    </ButtonGroup>
  )
}
