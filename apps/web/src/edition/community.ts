import type { ComponentType, ReactNode } from "react"

export type EditionSettingsUi = {
  Page: ComponentType<{
    children: ReactNode
    className?: string
    description: string
    title: string
  }>
  Row: ComponentType<{
    action?: ReactNode
    children?: ReactNode
    className?: string
    description?: ReactNode
    title: ReactNode
  }>
  Section: ComponentType<{
    action?: ReactNode
    children?: ReactNode
    className?: string
    description?: ReactNode
    title: ReactNode
  }>
}

export type EditionSettingsComponentProps = {
  settingsUi?: EditionSettingsUi
}

export type EditionLoginMethodProps = {
  disabled: boolean
  email: string
}

export type EditionWebModule = {
  routePrefix: string
  additionalLoginMethods: readonly ComponentType<EditionLoginMethodProps>[]
  components: Readonly<Record<string, ComponentType>>
  navigation: readonly {
    icon?: ComponentType<{ className?: string }>
    id: string
    title: string
    url: string
  }[]
  routes: readonly {
    component: ComponentType
    id: string
    path: string
  }[]
  settingsSections: readonly {
    component: ComponentType<EditionSettingsComponentProps>
    description?: string
    icon?: ComponentType<{ className?: string }>
    id: string
    title: string
  }[]
}
