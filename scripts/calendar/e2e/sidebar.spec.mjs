import { test, expect } from "@playwright/test";
async function openCalendarMenu(page, name) {
  const trigger = page.getByRole("button", { name: `Options for ${name}`, exact: true });
  await page
    .locator("[data-calendar-row]")
    .filter({ has: trigger })
    .locator("[data-sidebar=menu-button]")
    .focus();
  await trigger.click();
}
const calendars = [
  {
    id: "primary",
    bindingId: "binding",
    name: "Personal",
    timeZone: "Asia/Kolkata",
    colorId: null,
    primary: true,
    permissions: { read: true, write: true, owner: true, freeBusyOnly: false },
    defaultReminders: [],
  },
  {
    id: "holidays",
    bindingId: "binding",
    name: "Holidays in India",
    timeZone: "Asia/Kolkata",
    colorId: null,
    primary: false,
    permissions: { read: true, write: false, owner: false, freeBusyOnly: false },
    defaultReminders: [],
  },
];
test.beforeEach(async ({ page }) => {
  let preferences = {
    view: "week",
    hiddenCalendarKeys: [],
    defaultCalendarKey: null,
    weekStartsOn: 1,
    showWeekends: true,
    showDeclined: false,
    showWeekNumbers: false,
    timeFormat: "24",
    timeZone: "Asia/Kolkata",
    secondaryTimeZones: [],
    remindersEnabled: false,
  };
  await page.route("**/workspaces/workspace/calendar/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/preferences")) {
      if (route.request().method() === "PUT") preferences = route.request().postDataJSON();
      return route.fulfill({ json: preferences });
    }
    if (url.pathname.endsWith("/sources"))
      return route.fulfill({
        json: {
          providerConfigured: true,
          connections: [
            {
              workspaceId: "workspace",
              bindingId: "binding",
              accountId: "account",
              email: "calendar@example.test",
              status: "connected",
              pushAvailable: false,
            },
          ],
        },
      });
    if (url.pathname.endsWith("/calendars") || url.pathname.endsWith("/catalog"))
      return route.fulfill({ json: { calendars } });
    if (url.pathname.endsWith("/sync"))
      return route.fulfill({
        json: { calendars, revisions: { primary: 1, holidays: 1 }, pending: false },
      });
    if (url.pathname.endsWith("/ranges"))
      return route.fulfill({
        json: {
          calendarId: url.searchParams.get("calendarId"),
          start: url.searchParams.get("start"),
          end: url.searchParams.get("end"),
          generation: 1,
          revision: 1,
          events: [],
          complete: true,
          nextPageToken: null,
        },
      });
    return route.fulfill({ status: 503, json: { message: "Push unavailable" } });
  });
  await page.goto("/scripts/calendar/e2e/index.html?sidebar=1");
});
test("sidebar date picker and Google-only connection dialog use shared controls", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Personal Default", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add calendar account", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Connect Google Calendar");
  await expect(page.getByRole("dialog")).not.toContainText("Outlook");
  await page.keyboard.press("Escape");
  const mini = page.locator('[aria-label="Choose calendar date"]');
  await mini.getByRole("button", { name: /September 15th, 2026/ }).click();
  await expect(page.getByRole("combobox")).toContainText("Week");
  await expect(
    page.getByRole("button", { name: "Create event 2026-09-14 9:00", exact: true }),
  ).toBeVisible();
});
test("calendar eye, color submenu, removal confirmation and restoration persist", async ({
  page,
}) => {
  const name = "Holidays in India";
  await page.getByRole("button", { name: `Hide ${name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Show ${name}`, exact: true })).toBeVisible();
  await openCalendarMenu(page, name);
  await page.getByRole("menuitem", { name: /Color/ }).click();
  await page.getByRole("menuitem", { name: "Green", exact: true }).click();
  await page.keyboard.press("Escape");
  await openCalendarMenu(page, name);
  await page.getByRole("menuitem", { name: "Remove calendar from list" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("This won’t delete it");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
  await openCalendarMenu(page, name);
  await page.getByRole("menuitem", { name: "Remove calendar from list" }).click();
  await page.getByRole("button", { name: "Remove calendar", exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: `Hide ${name}`, exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name, exact: true }).locator("svg").first()).toHaveClass(
    /text-palette-green/,
  );
  for (const appearance of ["light", "dark"]) {
    await page.evaluate(
      (appearance) => document.documentElement.classList.toggle("dark", appearance === "dark"),
      appearance,
    );
    await page.screenshot({
      animations: "disabled",
      path: `.dev/calendar-e2e-results/sidebar-${appearance}.png`,
    });
  }
});

test("removal failure keeps the dialog and calendar, then allows retry", async ({ page }) => {
  let fail = true;
  await page.route("**/preferences", (route) => {
    if (
      route.request().method() === "PUT" &&
      route.request().postDataJSON().removedCalendarKeys?.length &&
      fail
    ) {
      fail = false;
      return route.fulfill({ status: 503, json: { message: "Preferences unavailable" } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Holidays in India", exact: true }).hover();
  await openCalendarMenu(page, "Holidays in India");
  await page.getByRole("menuitem", { name: "Remove calendar from list" }).click();
  await page.getByRole("button", { name: "Remove calendar", exact: true }).click();
  await expect(page.getByRole("alertdialog").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove calendar", exact: true })).toBeEnabled();
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/remove-dialog.png",
  });
  await page.getByRole("button", { name: "Remove calendar", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator('[id="calendar-account-binding"]')).toBeFocused();
});

test("calendar menus use shared inline panels on a narrow sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.getByRole("button", { name: "Personal Default", exact: true }).click();
  await openCalendarMenu(page, "Personal");
  await page.getByRole("menuitem", { name: /Color/ }).click();
  await expect(page.getByRole("button", { name: "Back from Color" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Grey", exact: true })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/color-menu-narrow.png",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Options for Personal", exact: true }),
  ).toBeFocused();
});

test("only the eye changes visibility and Default never overlaps actions", async ({ page }) => {
  const name = page.getByRole("button", { name: "Personal Default", exact: true });
  const eye = page.getByRole("button", { name: "Hide Personal", exact: true });
  await name.click();
  await expect(name).toBeFocused();
  await expect(eye).toHaveAttribute("aria-pressed", "true");
  await eye.click();
  await expect(page.getByRole("button", { name: "Show Personal", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await name.hover();
  await expect(name.locator("span").first()).toHaveClass(/text-content-secondary/);
  await name.click();
  await expect(page.getByRole("button", { name: "Show Personal", exact: true })).toBeVisible();
  const label = await name.getByText("Default", { exact: true }).boundingBox();
  const more = await page
    .getByRole("button", { name: "Options for Personal", exact: true })
    .boundingBox();
  expect(label.x + label.width).toBeLessThanOrEqual(more.x);
  const rowBox = await name.boundingBox();
  const eyeBox = await page
    .getByRole("button", { name: "Show Personal", exact: true })
    .boundingBox();
  const center = (box) => box.y + box.height / 2;
  expect(Math.abs(center(more) - center(rowBox))).toBeLessThan(1);
  expect(Math.abs(center(eyeBox) - center(rowBox))).toBeLessThan(1);
});

test("calendar source panel pages independently and creates on its selected source", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Personal Default", exact: true }).click();
  const panel = page.getByRole("region", { name: "Personal upcoming events" });
  await expect(panel).toBeVisible();
  const initial = await panel.getByRole("status").textContent();
  await panel.getByRole("button", { name: "Next 30 days" }).click();
  await expect(panel.getByRole("status")).not.toHaveText(initial);
  await panel.getByRole("button", { name: "Previous 30 days" }).click();
  await expect(panel.getByRole("status")).toHaveText(initial);
  await panel.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Calendar", { exact: true })).toContainText("Personal");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Holidays in India", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Holidays in India upcoming events" })
      .getByRole("button", { name: "Create event", exact: true }),
  ).toBeDisabled();
});

test("source collapse and order survive reload", async ({ page }) => {
  await expect(page.locator("[data-calendar-row]")).toHaveCount(2);
  const name = await page
    .locator("[data-calendar-row]")
    .last()
    .locator("[data-sidebar=menu-button]")
    .getAttribute("title");
  await openCalendarMenu(page, name);
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect(page.locator("[data-calendar-row]").first()).toContainText(name);
  await page.getByRole("button", { name: "calendar@example.test", exact: true }).click();
  await expect(page.getByRole("button", { name: "Holidays in India", exact: true })).toHaveCount(0);
  await page.reload();
  const account = page.getByRole("button", { name: "calendar@example.test", exact: true });
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await account.click();
  await expect(page.locator("[data-calendar-row]").first()).toContainText(name);
});

test("custom day count persists through navigation and reload", async ({ page }) => {
  await page.getByRole("button", { name: "Visible day count" }).click();
  await page.getByLabel("Visible days (1–31)").fill("3");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-calendar-period="1"] [data-calendar-day-column]')).toHaveCount(
    3,
  );
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(page.locator('[data-calendar-period="1"] [data-calendar-day-column]')).toHaveCount(
    3,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Visible day count" })).toContainText("3 days");
  await page
    .locator('[aria-label="Choose calendar date"]')
    .getByRole("button", { name: /September 15th, 2026/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Create event 2026-09-15 9:00", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-calendar-period="1"] [data-calendar-day-column]')).toHaveCount(
    3,
  );
});

test("general preferences persist and Today uses the chosen alignment", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-10T09:00:00Z") });
  await page.getByRole("button", { name: "Calendar settings", exact: true }).click();
  await page.getByLabel("Today navigation", { exact: true }).click();
  await page.getByRole("option", { name: "Align today at the start" }).click();
  await page.getByLabel("Maps preference", { exact: true }).click();
  await page.getByRole("option", { name: "Apple Maps", exact: true }).click();
  await page.getByLabel("Meeting preview (minutes before)").fill("30");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.locator('[data-calendar-period="1"] [data-calendar-day-column]').first(),
  ).toHaveAttribute("data-calendar-day-column", "2026-09-10");
  await page.reload();
  await page.getByRole("button", { name: "Calendar settings", exact: true }).click();
  await expect(page.getByLabel("Maps preference", { exact: true })).toContainText("Apple Maps");
  await expect(page.getByLabel("Meeting preview (minutes before)")).toHaveValue("30");
  await expect(page.getByRole("link", { name: "Profile settings" })).toHaveAttribute(
    "href",
    "/settings/profile",
  );
});

async function pickZone(page, zone) {
  await page.getByRole("combobox", { name: "Time zone", exact: true }).fill(zone);
  await page.getByRole("option").first().click();
}
async function zoneMenu(page, zone) {
  await page.getByRole("button", { name: `Time zone ${zone}`, exact: true }).click();
}
test("timezone rail adds, renames, promotes and persists four columns", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Personal Default", exact: true })).toBeVisible();
  for (const zone of ["Europe/London", "America/New_York", "UTC"]) {
    await page.getByRole("button", { name: "Add time zone", exact: true }).click();
    await pickZone(page, zone);
  }
  await expect(page.getByRole("button", { name: "Add time zone", exact: true })).toBeDisabled();
  await zoneMenu(page, "Europe/London");
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("Time zone label", { exact: true }).fill("Team");
  await page.getByRole("button", { name: "Save label" }).click();
  await zoneMenu(page, "Europe/London");
  await page.getByRole("menuitem", { name: "Make time zone primary" }).click();
  await expect(page.locator("[data-calendar-zone-labels]")).toHaveText("+UTCNew YorkKolkataTeam");
  await page.reload();
  await expect(page.locator("[data-calendar-zone-labels]")).toHaveText("+UTCNew YorkKolkataTeam");
  await zoneMenu(page, "Europe/London");
  await expect(page.getByRole("menuitem", { name: "Remove time zone from list" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await zoneMenu(page, "UTC");
  await page.getByRole("menuitem", { name: "Remove time zone from list" }).click();
  await expect(page.locator("[data-calendar-zone-labels]")).toHaveText("+New YorkKolkataTeam");
});

test("Z previews travel without saving and heading actions restore or save", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Personal Default", exact: true })).toBeVisible();
  const saved = await page.locator("[data-calendar-zone-labels]").textContent();
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().endsWith("/preferences"))
      writes.push(request.postDataJSON());
  });
  await page.keyboard.press("z");
  await pickZone(page, "Europe/London");
  await expect(page.locator("[data-calendar-zone-labels]")).toContainText("London");
  expect(writes).toHaveLength(0);
  await zoneMenu(page, "Europe/London");
  await page.getByRole("menuitem", { name: "Restore saved time zone" }).click();
  await expect(page.locator("[data-calendar-zone-labels]")).toHaveText(saved);
  await page.keyboard.press("z");
  await pickZone(page, "Europe/London");
  await zoneMenu(page, "Europe/London");
  await page.getByRole("menuitem", { name: "Add as primary time zone" }).click();
  await expect.poll(() => writes.length).toBe(1);
  await page.reload();
  await expect(page.locator("[data-calendar-zone-labels]")).toContainText("London");
  await expect(page.getByRole("button", { name: "Travel time zone", exact: true })).toHaveCount(0);
});
test("timezone picker supports right-click, keyboard selection, recent zones and rejected saves", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Personal Default", exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Time zone Asia/Kolkata", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /Change time zone/ }).click();
  await page.getByRole("combobox", { name: "Time zone", exact: true }).fill("London");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Time zone Europe/London", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add time zone", exact: true }).click();
  await page.getByRole("combobox", { name: "Time zone", exact: true }).fill("Kolkata");
  await expect(page.getByRole("option").first()).toContainText("GMT+05:30");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Time zone", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add time zone", exact: true })).toBeFocused();
  await page.keyboard.press("z");
  await expect(page.getByRole("group", { name: "Recent" })).toContainText("London");
  await page.keyboard.press("Escape");
  await page.route("**/preferences", async (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: { message: "Preferences unavailable" } })
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Add time zone", exact: true }).click();
  await pickZone(page, "America/New_York");
  await expect(
    page.getByRole("alert").filter({ hasText: "Preferences unavailable" }).first(),
  ).toBeVisible();
  await expect(page.locator("[data-calendar-zone-labels]")).not.toContainText("New York");
});
