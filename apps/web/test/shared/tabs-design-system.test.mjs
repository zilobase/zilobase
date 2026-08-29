import { readFile } from "node:fs/promises";

export function register({ readSource, assert, test }) {
  test("all shared tabs use the canonical control, text, spacing, and icon sizes", async () => {
    const tabsSource = await readSource("/src/shared/ui/app-tabs.tsx");

    assert.match(
      tabsSource,
      /h-8[\s\S]*?gap-2[\s\S]*?px-3[\s\S]*?text-sm[\s\S]*?\[&_svg:not\(\[class\*='size-'\]\)\]:size-4/,
    );
    assert.doesNotMatch(
      tabsSource,
      /h-7[\s\S]*?text-xs[\s\S]*?\[&_svg:not\(\[class\*='size-'\]\)\]:size-3\.5/,
    );
    assert.match(tabsSource, /data-active:bg-action-neutral-hover/);
    assert.doesNotMatch(tabsSource, /TabsPrimitive\.Indicator|tab-indicator/);
  });
}
