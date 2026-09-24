import { readFile } from "node:fs/promises";

export function register({ readSource, assert, test }) {
  test("all shared tabs use the canonical control, text, spacing, and icon sizes", async () => {
    const [tabsSource, buttonSource, inputSource, sidebarSource, databaseStyles] = await Promise.all([
      readSource("/src/shared/ui/app-tabs.tsx"),
      readSource("/src/shared/ui/button.tsx"),
      readSource("/src/shared/ui/input.tsx"),
      readSource("/src/shared/ui/sidebar.tsx"),
      readSource("/src/features/databases/styles/database.css"),
    ]);

    assert.match(buttonSource, /const buttonControlHeightClassName = "h-7"/);
    assert.match(
      buttonSource,
      /const buttonControlTextClassName = "text-xs\/relaxed font-medium"/,
    );
    assert.match(
      buttonSource,
      /default:\s*\n?\s*`\$\{buttonControlHeightClassName\} gap-1 px-2/,
    );
    assert.match(
      tabsSource,
      /buttonControlHeightClassName,[\s\S]*?buttonControlTextClassName,[\s\S]*?gap-2[\s\S]*?px-3[\s\S]*?\[&_svg:not\(\[class\*='size-'\]\)\]:size-4/,
    );
    assert.doesNotMatch(tabsSource, /text-sm font-medium/);
    assert.match(tabsSource, /data-active:bg-action-neutral-hover/);
    assert.match(tabsSource, /aria-\[current=page\]:bg-action-neutral-hover/);
    assert.match(tabsSource, /aria-\[current=page\]:active:bg-action-neutral-pressed/);
    assert.match(tabsSource, /rounded-lg p-0/);
    assert.match(buttonSource, /icon: "size-7/);
    assert.match(inputSource, /buttonControlHeightClassName,[\s\S]*?"w-full/);
    assert.match(sidebarSource, /buttonControlHeightClassName,[\s\S]*?peer\/menu-button/);
    assert.match(databaseStyles, /\.database-new-button\s*\{\s*@apply h-7/);
    assert.doesNotMatch(tabsSource, /TabsPrimitive\.Indicator|tab-indicator/);
  });

  test("tab layout choices are shared props and discussions use the default surface", async () => {
    const [tabsSource, discussionsSource] = await Promise.all([
      readSource("/src/shared/ui/app-tabs.tsx"),
      readSource("/src/features/comments/components/discussions-sidebar.tsx"),
    ]);

    assert.match(tabsSource, /const tabsVariants = cva/);
    assert.match(tabsSource, /const tabsListVariants = cva/);
    assert.match(tabsSource, /const tabsTriggerVariants = cva/);
    assert.match(tabsSource, /function TabsBadge/);
    assert.match(discussionsSource, /<TabsList>/);
    assert.match(discussionsSource, /<TabsBadge>\{openCount\}<\/TabsBadge>/);
    assert.doesNotMatch(discussionsSource, /<Tabs[^>]*border-b/);
    assert.doesNotMatch(discussionsSource, /<TabsTrigger[^>]*rounded-none/);
  });
}
