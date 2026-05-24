"use client"

import { useTheme } from "next-themes"
import { LaptopIcon, MoonIcon, SunIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const themes = [
  {
    value: "light",
    label: "Light",
    icon: SunIcon,
  },
  {
    value: "dark",
    label: "Dark",
    icon: MoonIcon,
  },
  {
    value: "system",
    label: "System",
    icon: LaptopIcon,
  },
]

export function ThemeDropdown() {
  const { theme = "system", setTheme } = useTheme()
  const activeTheme =
    themes.find((themeOption) => themeOption.value === theme) ?? themes[2]
  const ActiveIcon = activeTheme.icon

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip="Theme">
              <ActiveIcon />
              <span>Theme</span>
              <span className="ml-auto text-xs text-sidebar-foreground/60">
                {activeTheme.label}
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              {themes.map((themeOption) => {
                const ThemeIcon = themeOption.icon

                return (
                  <DropdownMenuRadioItem
                    key={themeOption.value}
                    value={themeOption.value}
                  >
                    <ThemeIcon />
                    {themeOption.label}
                  </DropdownMenuRadioItem>
                )
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
