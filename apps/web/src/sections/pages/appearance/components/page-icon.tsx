import { getPageEmoji, hasPageBodyContent, type Page } from "@zilobase/features/pages";
import { getDatabaseEmoji } from "@zilobase/features/databases";
import { getIconTextClassName } from "@/lib/color-tokens";
import {
  CONTENT_PAGE_ITEM_ICON,
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_PAGE_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";
import { useStoredIcon } from "@/hooks/use-stored-icon";
import { cn } from "@/lib/utils";
import {
  getDatabaseIconConfig,
  getStoredIconColor,
  isSvgIcon,
  sanitizeStoredSvg,
} from "@/components/ui/icon-svg";

const iconSizeClasses = {
  sm: "size-4 text-base [&_svg]:size-4",
  md: "size-5 text-lg [&_svg]:size-5",
  lg: "size-9 text-2xl [&_svg]:size-9",
  xl: "size-11 text-3xl [&_svg]:size-11",
  "2xl": "size-20 text-6xl [&_svg]:size-20",
} as const;

const svgIconSizeClasses = {
  sm: "size-4 [&_svg]:size-4",
  md: "size-5 [&_svg]:size-5",
  lg: "size-7 [&_svg]:size-7",
  xl: "size-9 [&_svg]:size-9",
  "2xl": "size-16 [&_svg]:size-16",
} as const;

export function PageIconDisplay({
  className,
  fallbackValue = DEFAULT_PAGE_ITEM_ICON,
  size = "md",
  value: storedValue,
}: {
  className?: string;
  /** Shown when a saved Phosphor icon has no Lucide equivalent. */
  fallbackValue?: string | null;
  size?: keyof typeof iconSizeClasses;
  value: string | null | undefined;
}) {
  const { icon: value, pending } = useStoredIcon(storedValue, fallbackValue);

  if (pending) {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex shrink-0", svgIconSizeClasses[size], className)}
      />
    );
  }

  if (!value) {
    return null;
  }

  if (isSvgIcon(value)) {
    const sanitized = sanitizeStoredSvg(value);

    if (!sanitized) {
      return null;
    }

    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          svgIconSizeClasses[size],
          getIconTextClassName(getStoredIconColor(sanitized)),
          className,
        )}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        iconSizeClasses[size],
        className,
      )}
    >
      {value}
    </span>
  );
}

type PageIconSource = Pick<Page, "content" | "hasContent" | "metadata">;

export function getDefaultPageIconValue(page?: Pick<Page, "content" | "hasContent"> | null) {
  const hasContent = page?.hasContent ?? hasPageBodyContent(page?.content);
  return hasContent ? CONTENT_PAGE_ITEM_ICON : DEFAULT_PAGE_ITEM_ICON;
}

export function getPageIconValue(page?: PageIconSource | null) {
  return (page ? getPageEmoji(page) : null) ?? getDefaultPageIconValue(page);
}

export function DefaultPageIcon({
  className,
  page,
  size = "sm",
}: {
  className?: string;
  page?: Pick<Page, "content" | "hasContent"> | null;
  size?: keyof typeof iconSizeClasses;
}) {
  return (
    <PageIconDisplay className={className} size={size} value={getDefaultPageIconValue(page)} />
  );
}

export function getPageIconNode(page: Pick<Page, "content" | "hasContent" | "metadata">) {
  return <PageIconDisplay size="sm" value={getPageIconValue(page)} />;
}

function getDatabaseIconValue(database: { config?: unknown; dataSourceConfig?: unknown }) {
  return getDatabaseEmoji({ config: getDatabaseIconConfig(database) });
}

export function getDatabaseIconNode(database: { config?: unknown; dataSourceConfig?: unknown }) {
  const icon = getDatabaseIconValue(database);

  if (icon) {
    return <PageIconDisplay fallbackValue={DEFAULT_DATABASE_ITEM_ICON} size="sm" value={icon} />;
  }

  return null;
}

export function PageIcon({ page }: { page: Pick<Page, "content" | "hasContent" | "metadata"> }) {
  return getPageIconNode(page);
}

export function formatPageBreadcrumbLabel(page: Pick<Page, "metadata" | "name">) {
  const label = page.name.trim() || "Untitled";
  const icon = getPageEmoji(page);

  if (!icon || isSvgIcon(icon)) {
    return label;
  }

  return `${icon} ${label}`;
}
