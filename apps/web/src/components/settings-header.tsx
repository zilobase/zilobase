type SettingsHeaderProps = {
  title: string
  description: string
}

export function SettingsHeader({ title, description }: SettingsHeaderProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col ">
      <h1 className="text-xl font-semibold tracking-normal">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
