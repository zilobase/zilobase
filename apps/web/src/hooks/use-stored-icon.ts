import * as React from "react";

import {
  isLegacyPhosphorSvg,
  peekLegacyIconSvg,
  resolveLegacyIconSvg,
} from "@/components/ui/icon-svg";

/**
 * Returns the icon to render for a stored icon value. Icons saved as Phosphor drawings
 * are converted to their Lucide equivalent; drawings without one use `fallback`.
 * `pending` is true while a saved Phosphor icon is being converted.
 */
export function useStoredIcon(value: string | null | undefined, fallback: string | null = null) {
  const legacy = isLegacyPhosphorSvg(value) ? value : null;
  const [converted, setConverted] = React.useState<{
    result: string | null;
    source: string;
  } | null>(null);

  React.useEffect(() => {
    if (!legacy || peekLegacyIconSvg(legacy) !== undefined) return;

    let cancelled = false;
    void resolveLegacyIconSvg(legacy).then((result) => {
      if (!cancelled) setConverted({ result, source: legacy });
    });

    return () => {
      cancelled = true;
    };
  }, [legacy]);

  if (!legacy) return { icon: value ?? null, pending: false };

  const peeked = peekLegacyIconSvg(legacy);
  const result =
    peeked !== undefined ? peeked : converted?.source === legacy ? converted.result : undefined;

  if (result === undefined) return { icon: null, pending: true };

  return { icon: result ?? fallback, pending: false };
}
