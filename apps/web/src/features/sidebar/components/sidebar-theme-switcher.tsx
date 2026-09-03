import { useTheme } from "next-themes"

import { MonitorIcon, MoonIcon, SunIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

export function SidebarThemeSwitcher() {
  const { setTheme, theme = "system" } = useTheme()
  const ThemeIcon = theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : MonitorIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Change theme"
          className="size-7 text-content-secondary [&_svg]:size-4!"
          size="icon-lg"
          title="Theme"
          type="button"
          variant="ghost"
        >
          <ThemeIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36" side="bottom">
        <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
          <DropdownMenuRadioItem value="light"><SunIcon /><span>Light</span></DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><MoonIcon /><span>Dark</span></DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><MonitorIcon /><span>System</span></DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
