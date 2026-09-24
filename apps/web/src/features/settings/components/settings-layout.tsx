import type { ComponentType, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";
import { SettingsHeader } from "./settings-header";

export type SettingsPageProps = {
  children: ReactNode;
  className?: string;
  description: string;
  title: string;
};

export function SettingsPage({ children, className, description, title }: SettingsPageProps) {
  return (
    <main className={cn("flex min-h-full flex-1 flex-col gap-6 px-4 py-8", className)}>
      <SettingsHeader description={description} title={title} />
      <div className="mx-auto grid w-full max-w-3xl gap-6">{children}</div>
    </main>
  );
}

export type SettingsSectionProps = {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
};

export function SettingsSection({
  action,
  children,
  className,
  description,
  title,
}: SettingsSectionProps) {
  return (
    <section className={cn("grid gap-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="font-heading text-base leading-snug font-medium">{title}</h2>
          {description ? <div className="text-sm text-content-secondary">{description}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export type SettingsRowProps = {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
};

export function SettingsRow({ action, children, className, description, title }: SettingsRowProps) {
  return (
    <div
      className={cn("flex min-h-10 flex-wrap items-center justify-between gap-3 py-1", className)}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-content-primary">{title}</div>
        {description ? <div className="text-xs text-content-secondary">{description}</div> : null}
      </div>
      {children}
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export type SettingsUi = {
  Page: ComponentType<SettingsPageProps>;
  Row: ComponentType<SettingsRowProps>;
  Section: ComponentType<SettingsSectionProps>;
};

export const settingsUi: SettingsUi = {
  Page: SettingsPage,
  Row: SettingsRow,
  Section: SettingsSection,
};
