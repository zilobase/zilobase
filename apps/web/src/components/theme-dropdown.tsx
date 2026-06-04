"use client"

import { useTheme } from "next-themes"
import { CheckIcon, LaptopIcon, MoonIcon, SunIcon } from "lucide-react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
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
        <DropDrawer>
          <DropDrawerTrigger asChild>
            <SidebarMenuButton tooltip="Theme">
              <ActiveIcon />
              <span>Theme</span>
              <span className="ml-auto text-xs text-sidebar-foreground/60">
                {activeTheme.label}
              </span>
            </SidebarMenuButton>
          </DropDrawerTrigger>
          <DropDrawerContent side="top" align="start">
            {themes.map((themeOption) => {
              const ThemeIcon = themeOption.icon
              const isSelected = themeOption.value === theme

              return (
                <DropDrawerItem
                  key={themeOption.value}
                  onSelect={() => setTheme(themeOption.value)}
                >
                  <ThemeIcon />
                  {themeOption.label}
                  {isSelected ? <CheckIcon className="ml-auto" /> : null}
                </DropDrawerItem>
              )
            })}
          </DropDrawerContent>
        </DropDrawer>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
