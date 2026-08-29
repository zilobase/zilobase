import type { ReactNode } from "react";

type ViewSettingsRowProps = {
  icon: ReactNode;
  label: string;
  right?: ReactNode;
};

export function ViewSettingsRow({
  icon,
  label,
  right,
}: ViewSettingsRowProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon}
      <span className="truncate">{label}</span>
      {right ? (
        <span className="ml-auto shrink-0 text-muted-foreground">{right}</span>
      ) : null}
    </div>
  );
}
