import { test, expect } from "@playwright/test";
const event = { workspaceId: "workspace", bindingId: "binding", calendarId: "primary", eventId: "event", etag: "v1", title: "Design review", description: "Discuss calendar design", location: "Studio", start: { dateTime: "2026-09-09T04:30:00Z", timeZone: "Asia/Kolkata" }, end: { dateTime: "2026-09-09T05:30:00Z", timeZone: "Asia/Kolkata" }, status: "confirmed", eventType: "default", attendees: [], reminders: { useDefault: true }, transparency: "opaque", visibility: "default", colorId: "2", htmlLink: "" };
test.beforeEach(async ({ page }) => {
  let fixtureEvents = [event];
  await page.route("**/workspaces/workspace/calendar/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" && url.pathname.includes("/events")) {
      const body = route.request().postDataJSON(); const updated = { ...event, ...body.event, eventId: url.pathname.endsWith("/events") ? "created" : "event", etag: "v2" };
      fixtureEvents = [updated]; return route.fulfill({ json: { operationId: body.operationId, status: "succeeded", event: updated } });
    }
    if (url.pathname.endsWith("/realtime-ticket")) return route.fulfill({ status: 503, json: { message: "Push unavailable" } });
    if (url.pathname.endsWith("/sync") || url.pathname.endsWith("/catalog")) return route.fulfill({ json: { calendars: [{ id: "primary", bindingId: "binding", name: "Personal", timeZone: "Asia/Kolkata", colorId: "2", primary: true, permissions: { read: true, write: true, owner: true, freeBusyOnly: false }, defaultReminders: [] }], revisions: { primary: 1 }, pending: false } });
    if (url.pathname.endsWith("/ranges")) return route.fulfill({ json: { calendarId: "primary", start: url.searchParams.get("start"), end: url.searchParams.get("end"), generation: 1, revision: 1, events: fixtureEvents, complete: true, nextPageToken: null } });
    return route.fulfill({ json: { events: [event], nextPageToken: null } });
  });
  await page.goto("/scripts/calendar/e2e/index.html");
  await page.waitForFunction(() => Boolean(window.calendarFixture));
});
test("cached week opens details and switches views", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  await page.getByRole("button", { name: /Design review/ }).click();
  await expect(page.getByRole("heading", { name: "Design review" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox").click(); await page.getByRole("option", { name: "Month", exact: true }).click();
  await expect(page.getByRole("button", { name: /Design review/ }).first()).toBeVisible();
});

test("calendarcn wheel gestures translate once and settle on exact dates", async ({ page }) => {
  await page.evaluate(() => window.calendarFixture.navigate("week", "2026-09-09"));
  const timeline = page.locator("[data-calendar-timeline-scroll]");
  const horizontal = timeline.locator('[data-calendar-scroll-content="horizontal"]');
  await expect(timeline).toBeVisible();
  const columnWidth = await timeline.locator("[data-calendar-day-column]").first().evaluate(element => element.clientWidth);
  const gesture = await timeline.evaluate((element, deltaX) => {
    const content = element.querySelector('[data-calendar-scroll-content="horizontal"]');
    const before = content.style.transform;
    const wheel = new WheelEvent("wheel", { deltaX, deltaY: 1, bubbles: true, cancelable: true });
    element.dispatchEvent(wheel);
    return { before, cancelled: wheel.defaultPrevented };
  }, columnWidth * .75);
  expect(gesture.cancelled).toBe(true);
  await page.waitForTimeout(500);
  await expect.poll(() => page.evaluate(() => window.calendarFixture.search().date)).toBe("2026-09-08");
  await expect(horizontal).toHaveCSS("transition-duration", "0s");
  const verticalCancelled = await timeline.evaluate(element => {
    const wheel = new WheelEvent("wheel", { deltaX: 1, deltaY: 80, bubbles: true, cancelable: true });
    element.dispatchEvent(wheel);
    return wheel.defaultPrevented;
  });
  expect(verticalCancelled).toBe(false);

  await timeline.evaluate((element, deltaX) => element.dispatchEvent(new WheelEvent("wheel", { deltaX, deltaY: 1, bubbles: true, cancelable: true })), columnWidth * .25);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.calendarFixture.search().date)).toBe("2026-09-08");

  await page.evaluate(() => window.calendarFixture.navigate("month", "2026-09-09"));
  const month = page.locator("[data-calendar-month-scroll]");
  await expect(month).toBeVisible();
  for (let index = 0; index < 2; index++) {
    const cancelled = await month.evaluate(element => {
      const wheel = new WheelEvent("wheel", { deltaX: 1, deltaY: 100, bubbles: true, cancelable: true });
      element.dispatchEvent(wheel);
      return wheel.defaultPrevented;
    });
    expect(cancelled).toBe(true);
    await page.waitForTimeout(400);
  }
  await expect.poll(() => page.evaluate(() => window.calendarFixture.search().date)).toBe("2026-09-17");
});
test("calendar renders all appearance families", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  for (const family of ["default", "warm", "midnight", "forest", "ocean", "notion"]) for (const appearance of ["light", "dark"]) {
    await page.evaluate(({ family, appearance }) => { document.documentElement.dataset.themeFamily = family; document.documentElement.className = appearance }, { family, appearance });
    await page.screenshot({ animations: "disabled", path: `.dev/calendar-e2e-results/${family}-${appearance}.png` });
  }
});

test("create event sits at the trailing edge of the month heading", async ({ page }) => {
  const heading = page.getByRole("heading", { name: "September 2026", exact: true });
  const create = page.getByRole("button", { name: "Create event", exact: true });
  const headingBox = await heading.boundingBox();
  const createBox = await create.boundingBox();
  const rowBox = await heading.evaluate(element => element.parentElement.getBoundingClientRect());
  expect(createBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
  expect(rowBox.right - (createBox.x + createBox.width)).toBeLessThanOrEqual(20);
});

test("create event persists through the actual editor", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Create event", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Planning session");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("button", { name: /Planning session/ })).toBeVisible();
});

test("recovery checks Google without push and preserves cached rendering", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  let checks = 0;
  page.on("request", request => { if (request.url().endsWith("/sync")) checks++ });
  await page.clock.install();
  await page.reload();
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  checks = 0;
  await page.clock.fastForward(70_000);
  await expect.poll(() => checks).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
});

test("cached view changes meet the 1000-occurrence budget", async ({ page }, testInfo) => {
  const events = Array.from({ length: 1000 }, (_, index) => ({ ...event, eventId: `benchmark-${index}`, title: `Meeting ${index}`, start: { dateTime: new Date(Date.UTC(2026, 8, index % 28 + 1, 3 + Math.floor(index / 28) % 14, index % 4 * 15)).toISOString(), timeZone: "Asia/Kolkata" }, end: { dateTime: new Date(Date.UTC(2026, 8, index % 28 + 1, 4 + Math.floor(index / 28) % 14, index % 4 * 15)).toISOString(), timeZone: "Asia/Kolkata" } }));
  await page.route("**/ranges?**", route => { const url = new URL(route.request().url()); return route.fulfill({ json: { calendarId: "primary", start: url.searchParams.get("start"), end: url.searchParams.get("end"), generation: 1, revision: 2, events, complete: true, nextPageToken: null } }) });
  await page.evaluate(() => window.calendarFixture.navigate("month"));
  await expect(page.getByRole("button", { name: /Meeting/ }).first()).toBeVisible();
  await page.evaluate(() => window.calendarFixture.offline());
  const durations = [];
  for (const view of ["day", "week", "month"]) {
    durations.push(await page.evaluate(async view => { const begin = performance.now(); await window.calendarFixture.navigate(view); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return performance.now() - begin }, view));
  }
  await testInfo.attach("cached-view-benchmark.json", { body: JSON.stringify({ occurrences: 1000, views: ["day", "week", "month"], durations }), contentType: "application/json" });
  console.info("Cached navigation (day/week/month), ms:", durations.map(value => Math.round(value)));
  expect(Math.max(...durations)).toBeLessThan(100);
});

test("drag sends one snapped mutation only on drop", async ({ page }) => {
  const writes = []; page.on("request", request => { if (request.method() === "POST" && request.url().includes("/events/")) writes.push(request.postDataJSON()) });
  const card = page.getByRole("button", { name: /Design review/ }); await expect(card).toBeVisible();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24, { steps: 4 });
  expect(writes).toHaveLength(0); await page.mouse.up();
  await expect.poll(() => writes.length).toBe(1);
  expect(Date.parse(writes[0].event.start.dateTime) - Date.parse(event.start.dateTime)).toBe(30 * 60000);
});

test("a definite conflict restores the cache and keeps the edited draft", async ({ page }) => {
  await page.route("**/events/event/update", route => route.fulfill({ status: 412, json: { message: "event_changed" } }));
  await page.getByRole("button", { name: /Design review/ }).click(); await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Conflict draft"); await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("alert")).toContainText("event_changed"); await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Conflict draft");
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
});

test("uncertain delivery prevents duplicate submissions", async ({ page }) => {
  let writes = 0;
  await page.route("**/events/event/update", route => { writes++; const body = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { operationId: body.operationId, status: "ambiguous" } }) });
  await page.getByRole("button", { name: /Design review/ }).click(); await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Pending draft"); await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByRole("button", { name: "Save event" })).toBeDisabled(); await expect(page.getByRole("button", { name: "Check delivery status" })).toBeVisible(); expect(writes).toBe(1);
});

test("realtime heartbeats and scoped invalidation refresh ranges", async ({ page }) => {
  await page.clock.install(); let socket, pings = 0, ranges = 0;
  await page.routeWebSocket("ws://localhost:1498/calendar-test-realtime", ws => { socket = ws; ws.send(JSON.stringify({ type: "calendar.ready" })); ws.onMessage(message => { if (JSON.parse(String(message)).type === "calendar.ping") { pings++; ws.send(JSON.stringify({ type: "calendar.pong" })) } }) });
  await page.route("**/realtime-ticket", route => route.fulfill({ json: { websocketUrl: "ws://localhost:1498/calendar-test-realtime", websocketProtocols: [], expiresAt: new Date(Date.now() + 300000).toISOString() } }));
  await page.reload(); await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  await page.clock.fastForward(25000); await expect.poll(() => pings).toBeGreaterThan(0);
  page.on("request", request => { if (request.url().includes("/ranges?")) ranges++ });
  socket.send(JSON.stringify({ type: "calendar.invalidate", workspaceId: "workspace", bindingId: "binding", calendarId: "primary", generation: 1, revision: 2 }));
  await expect.poll(() => ranges).toBeGreaterThan(0);
});

for (const view of ["day", "week"]) {
  test(`${view} snaps between periods and preserves the vertical time position`, async ({ page }) => {
    await page.evaluate(view => window.calendarFixture.navigate(view), view);
    const pager = page.locator("[data-calendar-period-scroll]");
    const activeGrid = page.locator('[data-calendar-period="1"] [data-calendar-scroll]').first();
    await expect(pager).toBeVisible();
    await expect(page.locator('[data-calendar-period="1"]')).toHaveAttribute("data-calendar-period-ready", "true");
    await activeGrid.evaluate(element => { element.scrollTop = 240 });
    await activeGrid.hover();
    await page.mouse.wheel(await pager.evaluate(element => element.clientWidth), 0);
    const nextDate = view === "day" ? "2026-09-10" : "2026-09-14";
    await expect(page.getByRole("button", { name: `Create event ${nextDate} 9:00`, exact: true })).toBeAttached();
    await expect.poll(() => activeGrid.evaluate(element => element.scrollTop)).toBe(240);
    await expect.poll(() => pager.evaluate(element => Math.abs(element.scrollLeft - element.clientWidth))).toBeLessThan(2);
    await pager.evaluate(element => element.scrollTo({ left: 0, behavior: "smooth" }));
    const originalDate = view === "day" ? "2026-09-09" : "2026-09-07";
    await expect(page.getByRole("button", { name: `Create event ${originalDate} 9:00`, exact: true })).toBeAttached();
    await expect.poll(() => activeGrid.evaluate(element => element.scrollTop)).toBe(240);
  });
}

test("every calendar view scrolls vertically in a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 480 });
  for (const view of ["day", "week", "month"]) {
    await page.evaluate(view => window.calendarFixture.navigate(view), view);
    const scroll = view === "day" || view === "week"
      ? page.locator('[data-calendar-period="1"] [data-calendar-scroll]').first()
      : page.locator("[data-calendar-scroll]");
    await expect(scroll).toBeVisible();
    if (view === "month") await expect(scroll.getByRole("status")).toHaveCount(0);
    else await expect(page.locator('[data-calendar-period="1"]')).toHaveAttribute("data-calendar-period-ready", "true");
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    const target = view === "month" ? 700 : 100;
    await scroll.evaluate((element, top) => { element.scrollTop = top }, target);
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(target);
  }
});

test("a healthy socket without provider watches retains one-minute recovery", async ({ page }) => {
  await page.clock.install(); let checks = 0;
  await page.routeWebSocket("ws://localhost:1498/calendar-test-realtime", ws => {
    ws.send(JSON.stringify({ type: "calendar.ready" }));
    ws.onMessage(message => { if (JSON.parse(String(message)).type === "calendar.ping") ws.send(JSON.stringify({ type: "calendar.pong" })); });
  });
  await page.route("**/realtime-ticket", route => route.fulfill({ json: { websocketUrl: "ws://localhost:1498/calendar-test-realtime", websocketProtocols: [], expiresAt: new Date(Date.now() + 300000).toISOString(), providerWatchExpiresAt: null } }));
  await page.reload(); await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  page.on("request", request => { if (request.url().endsWith("/sync")) checks++; });
  await page.clock.fastForward(70000);
  await expect.poll(() => checks).toBeGreaterThan(0);
});

for (const view of ["day", "week"]) test(`${view} pins headers and timezone rail in both scroll directions`, async ({ page }) => {
  await page.evaluate(view => window.calendarFixture.navigate(view), view);
  const header = page.locator('[data-calendar-period="1"] [data-calendar-column-header]').first(), axis = page.locator("[data-calendar-time-axis]"), pager = page.locator("[data-calendar-period-scroll]");
  const headerBox = await header.boundingBox(), axisBox = await axis.boundingBox();
  const active = page.locator('[data-calendar-period="1"] [data-calendar-scroll]').first();
  await active.evaluate(element => { element.scrollTop = 240 });
  await expect.poll(() => axis.evaluate(element => element.scrollTop)).toBe(240);
  await pager.evaluate(element => { element.scrollLeft = element.clientWidth * 2 });
  await expect(page.getByRole("button", { name: `Create event ${view === "day" ? "2026-09-10" : "2026-09-14"} 9:00`, exact: true })).toBeAttached();
  expect((await header.boundingBox()).y).toBe(headerBox.y);
  await expect.poll(() => pager.evaluate(element => Math.abs(element.scrollLeft - element.clientWidth))).toBeLessThan(2);
  expect((await header.boundingBox()).x).toBe(headerBox.x);
  expect((await axis.boundingBox()).x).toBe(axisBox.x);
  await expect.poll(() => axis.evaluate(element => element.scrollTop)).toBe(240);
});

test("month scroll continues in both directions with bounded rows and stable anchors", async ({ page }) => {
  await page.evaluate(() => window.calendarFixture.navigate("month"));
  const scroll = page.locator("[data-calendar-month-scroll]");
  await expect(scroll).toBeVisible();
  for (let index = 0; index < 8; index++) {
    const before = await page.locator("[data-calendar-week]").first().getAttribute("data-calendar-week");
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight - element.clientHeight - 10 });
    await expect(page.locator("[data-calendar-week]").first()).not.toHaveAttribute("data-calendar-week", before);
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(300);
  }
  await expect(page.getByRole("heading", { name: /2027/, exact: false }).first()).toBeVisible();
  expect(await page.locator("[data-calendar-week]").count()).toBeLessThanOrEqual(12);
  for (let index = 0; index < 8; index++) {
    const before = await page.locator("[data-calendar-week]").first().getAttribute("data-calendar-week");
    await scroll.evaluate(element => { element.scrollTop = 20 });
    await expect(page.locator("[data-calendar-week]").first()).not.toHaveAttribute("data-calendar-week", before);
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(596);
  }
  await page.evaluate(() => window.calendarFixture.navigate("month", "2026-09-09"));
  await expect(page.getByRole("heading", { name: "September 2026", exact: true })).toBeVisible();
  await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(576);
});

test("topbar uses the shared action slot and compact navigation", async ({ page }) => {
  const header = page.locator('header').filter({ has: page.getByRole('button', { name: 'Calendar settings', exact: true }) });
  await expect(header.getByRole('textbox', { name: 'Search calendar' })).toBeVisible();
  await expect(header.getByRole('combobox', { name: 'Calendar view' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'September 2026', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'September 2026', exact: true })).toHaveCount(0);
  const controls = ['Calendar event panel', 'Today', 'Previous period', 'Next period', 'Calendar settings'];
  let right = 0;
  for (const name of controls) {
    const box = await header.getByRole('button', { name, exact: true }).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(right); right = box.x + box.width;
  }
  const box = await header.boundingBox(); expect(box.x + box.width - right).toBeGreaterThanOrEqual(12);
  await page.setViewportSize({ width: 600, height: 650 });
  await expect(header.getByRole('textbox', { name: 'Search calendar' })).toBeHidden();
  await header.getByRole('button', { name: 'Search events', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search calendar' }).fill('Design');
  await page.keyboard.press('Escape');
  await header.getByRole('button', { name: 'Calendar navigation', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Next period', exact: true }).click();
  expect((await header.boundingBox()).height).toBe(48);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Calendar dock retains drafts across AI, floating AI and mobile transitions", async ({ page }) => {
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Preserved calendar draft');
  const dock = page.locator('[data-calendar-event-panel]');
  await expect(dock).toBeVisible();
  await page.getByRole('button', { name: 'Open AI', exact: true }).click();
  await expect(dock).toHaveAttribute('inert', '');
  await expect(page.getByRole('heading', { name: 'Ask AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle floating AI' }).click();
  await expect(page.getByRole('complementary', { name: 'Floating AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar event panel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ask AI' })).toBeHidden();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Preserved calendar draft');
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(page.locator('#mobile-right-sidebar-primary')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Preserved calendar draft');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Preserved calendar draft');
  await page.getByRole('button', { name: 'Close calendar event panel' }).click();
  await expect(page.getByRole('button', { name: 'Calendar event panel', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Open AI', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Floating AI' })).toBeVisible();
});

test("event deep links open the dock and explicit close clears selection", async ({ page }) => {
  await page.evaluate(() => window.calendarFixture.select('event'));
  await expect(page.getByRole('heading', { name: 'Design review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close calendar event panel' }).click();
  expect(await page.evaluate(() => window.calendarFixture.search())).not.toHaveProperty('event');
  await page.getByRole('button', { name: 'Calendar event panel', exact: true }).click();
  const panel = page.locator('[data-calendar-event-panel]');
  await expect(panel).toContainText('Select an event');
  await panel.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeVisible();
});

test("dock resizes, nested controls retain Escape, and event close restores its trigger", async ({ page }) => {
  const card = page.getByRole('button', { name: /Design review/ });
  await card.click();
  const panel = page.locator('[data-calendar-event-panel]');
  const handle = page.locator('[data-slot="resizable-handle"]');
  await expect(page.locator('#right-sidebar-dock')).not.toHaveAttribute('data-sidebar-transitioning', '');
  const before = await panel.boundingBox(), grip = await handle.boundingBox();
  await page.mouse.move(grip.x, grip.y + 100); await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + 100, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox()).width).toBeLessThan(before.width - 20);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  expect((await page.getByLabel("Start date", { exact: true }).boundingBox()).width).toBeGreaterThan(180);
  // A nested shared Select handles Escape without closing the event panel.
  const select = panel.getByRole('combobox').filter({ hasNot: page.locator('[disabled]') }).last();
  await select.click();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveAttribute('aria-hidden', 'false');
  for (const appearance of ['light', 'dark']) {
    await page.evaluate(mode => document.documentElement.classList.toggle('dark', mode === 'dark'), appearance);
    await page.screenshot({ animations: 'disabled', path: `.dev/calendar-e2e-results/dock-${appearance}.png` });
  }
  await page.getByRole('button', { name: 'Close calendar event panel' }).click();
  await expect(card).toBeFocused();
});

test("superseded search failures cannot replace the current period error state", async ({ page }) => {
  let release, failed;
  await page.route('**/search?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'old') {
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 404, json: { message: 'Superseded search' } }); failed = true; return;
    }
    return route.fulfill({ json: { events: [event], nextPageToken: null } });
  });
  await expect(page.getByRole('button', { name: /Design review/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search calendar' }).fill('old');
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole('textbox', { name: 'Search calendar' }).fill('Design');
  await expect(page.getByRole('button', { name: /Design review/ })).toBeVisible();
  release(); await expect.poll(() => failed).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test("catalog errors stay actionable while cached events survive and recovery clears them", async ({ page }) => {
  await page.clock.install(); let socket;
  await page.routeWebSocket('ws://localhost:1498/calendar-test-realtime', ws => { socket = ws; ws.send(JSON.stringify({ type: 'calendar.ready' })); });
  await page.route('**/realtime-ticket', route => route.fulfill({ json: { websocketUrl: 'ws://localhost:1498/calendar-test-realtime', websocketProtocols: [], expiresAt: new Date(Date.now() + 300000).toISOString() } }));
  await page.reload(); await expect(page.getByRole('button', { name: /Design review/ })).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);
  await page.route('**/catalog', route => route.fulfill({ status: 404, json: { message: 'Calendar catalog unavailable' } }));
  socket.send(JSON.stringify({ type: 'calendar.invalidate', workspaceId: 'workspace', bindingId: 'binding', calendarId: 'primary', generation: 1, revision: 2 }));
  await expect(page.getByRole('alert')).toContainText('Calendar catalog unavailable');
  await expect(page.getByRole('button', { name: /Design review/ })).toBeVisible();
  await page.clock.fastForward(70_000);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Design review/ })).toBeVisible();
});

test("the entire event card opens unified details with expandable participants", async ({ page }) => {
  const attendees = Array.from({ length: 8 }, (_, index) => ({ email: `guest${index}@example.test`, displayName: `Guest ${index}`, self: index === 7, organizer: index === 0, responseStatus: index === 7 ? 'needsAction' : index < 5 ? 'accepted' : 'declined' }));
  const detailed = { ...event, attendees, organizer: { email: 'guest0@example.test' }, conferenceUrl: 'https://meet.google.com/abc-defg-hij', recurringEventId: 'series', reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] } };
  await page.route('**/ranges?**', route => { const url = new URL(route.request().url()); return route.fulfill({ json: { calendarId: 'primary', start: url.searchParams.get('start'), end: url.searchParams.get('end'), generation: 2, revision: 10, events: [detailed], complete: true, nextPageToken: null } }); });
  await page.reload();
  const card = page.getByRole('button', { name: /Design review/ });
  await expect(card).toHaveClass(/border-dashed/);
  await expect(card).toContainText('10:00–11:00');
  const box = await card.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
  const panel = page.locator('[data-calendar-event-panel]');
  await expect(panel.getByRole('heading', { name: 'Design review', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: '8 participants', exact: true })).toBeVisible();
  await expect(panel.getByText('5 yes · 2 no · 0 maybe · 1 awaiting', { exact: true })).toBeVisible();
  await expect(panel.getByText('Guest 4', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'See all 8 participants' }).click();
  await expect(panel.getByText('Guest 4', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('link', { name: 'Google Meet' })).toHaveAttribute('href', detailed.conferenceUrl);
  await expect(panel.getByText('10min before', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Show fewer participants' }).click();
  await panel.getByRole('heading', { name: 'Design review', exact: true }).scrollIntoViewIfNeeded();
  for (const mode of ['light', 'dark']) {
    await page.evaluate(mode => document.documentElement.classList.toggle('dark', mode === 'dark'), mode);
    await page.screenshot({ animations: 'disabled', path: `.dev/calendar-e2e-results/event-details-${mode}.png` });
  }
});


test("week snaps by day and moves dates and all-day cells with the grid", async ({ page }) => {
  const holiday = { ...event, eventId: 'holiday', title: 'All-day holiday', start: { date: '2026-09-09' }, end: { date: '2026-09-10' } };
  await page.route('**/ranges?**', route => { const url = new URL(route.request().url()); return route.fulfill({ json: { calendarId: 'primary', start: url.searchParams.get('start'), end: url.searchParams.get('end'), generation: 2, revision: 10, events: [event, holiday], complete: true, nextPageToken: null } }); });
  await page.reload();
  const pager = page.locator('[data-calendar-period-scroll]');
  const active = page.locator('[data-calendar-period="1"] [data-calendar-scroll]').first();
  const header = page.locator('[data-calendar-date-header="2026-09-09"]');
  const allDay = page.locator('[data-calendar-all-day="2026-09-09"]');
  const slot = page.getByRole('button', { name: 'Create event 2026-09-09 9:00', exact: true });
  await expect(page.getByText('All-day', { exact: true })).toHaveCount(0);
  await expect(allDay.getByRole('button', { name: 'All-day holiday', exact: true })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Collapse all-day events', exact: true });
  const zoneBox = await page.locator('[data-calendar-zone-labels]').boundingBox();
  const toggleBox = await toggle.boundingBox();
  const allDayBox = await allDay.boundingBox();
  expect(toggleBox.y - (zoneBox.y + zoneBox.height)).toBeGreaterThanOrEqual(8);
  expect(allDayBox.height).toBeGreaterThanOrEqual(48);
  const before = await header.boundingBox();
  await pager.evaluate(element => { element.style.scrollSnapType = 'none'; element.scrollLeft += element.clientWidth / 14; });
  await expect.poll(async () => Math.abs((await header.boundingBox()).x - (await slot.boundingBox()).x)).toBeLessThan(2);
  expect((await header.boundingBox()).x).toBeLessThan(before.x - 20);
  await expect.poll(async () => Math.abs((await allDay.boundingBox()).x - (await slot.boundingBox()).x)).toBeLessThan(2);
  await pager.evaluate(element => { element.style.scrollSnapType = ''; element.scrollTo({ left: element.clientWidth * (1 + 1 / 7), behavior: 'smooth' }); });
  await expect.poll(() => pager.evaluate(element => Math.abs(element.scrollLeft - element.clientWidth * (1 + 1 / 7)))).toBeLessThan(2);
  await active.evaluate(element => { element.scrollTop = 400; });
  expect((await header.boundingBox()).y).toBe(before.y);
  await expect(page.getByText('All-day', { exact: true })).toHaveCount(0);
  const offset = await pager.evaluate(element => element.scrollLeft);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Expand all-day events', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(allDay.getByRole('button', { name: 'All-day holiday', exact: true })).toHaveCount(0);
  await expect(allDay.getByRole('button', { name: 'Expand 1 all-day event on 2026-09-09', exact: true })).toHaveText('1 event');
  await expect.poll(() => pager.evaluate(element => element.scrollLeft)).toBe(offset);
  await expect.poll(() => active.evaluate(element => element.scrollTop)).toBe(400);
  await page.screenshot({ animations: 'disabled', path: '.dev/calendar-e2e-results/all-day-collapsed.png' });
  await allDay.getByRole('button', { name: 'Expand 1 all-day event on 2026-09-09', exact: true }).click();
  await expect(allDay.getByRole('button', { name: 'All-day holiday', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse all-day events', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Collapse all-day events', exact: true })).toBeFocused();
  await page.screenshot({ animations: 'disabled', path: '.dev/calendar-e2e-results/day-column-scroll.png' });
});

test("vertical wheel over the pinned all-day row scrolls time and does not page", async ({ page }) => {
  await page.evaluate(() => window.calendarFixture.navigate("week"));
  const pager = page.locator("[data-calendar-period-scroll]");
  const active = page.locator('[data-calendar-period="1"] [data-calendar-scroll]').first();
  const allDay = page.locator('[data-calendar-all-day="2026-09-09"]');
  const header = page.locator('[data-calendar-period="1"] [data-calendar-column-header]').first();
  await expect(allDay).toBeVisible();
  await expect(page.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
  const left = await pager.evaluate(element => element.scrollLeft);
  const top = await active.evaluate(element => element.scrollTop);
  const headerY = (await header.boundingBox()).y;
  await allDay.hover();
  await page.mouse.wheel(200, 400);
  await expect.poll(() => active.evaluate(element => element.scrollTop)).toBeGreaterThan(top);
  await expect.poll(() => pager.evaluate(element => element.scrollLeft)).toBe(left);
  expect((await header.boundingBox()).y).toBe(headerY);
  await allDay.hover();
  await page.mouse.wheel(await pager.evaluate(element => element.clientWidth), 0);
  await expect(page.getByRole("button", { name: "Create event 2026-09-14 9:00", exact: true })).toBeAttached();
  expect((await header.boundingBox()).y).toBe(headerY);
});
test("retired agenda links open Week and the menu only offers supported views", async ({ page }) => {
  await page.evaluate(() => window.calendarFixture.navigate("agenda"));
  await expect(page.getByRole("combobox")).toContainText("Week");
  await page.getByRole("combobox").click();
  await expect(page.getByRole("option", { name: "Agenda", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(3);
});

test("meeting preview reads today independently of the displayed period", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-09T04:20:00Z") });
  await page.route("**/ranges?**", route => { const url = new URL(route.request().url()); return route.fulfill({ json: { calendarId: "primary", start: url.searchParams.get("start"), end: url.searchParams.get("end"), generation: 1, revision: 1, events: [{ ...event, conferenceUrl: "https://meet.google.com/abc-defg-hij" }], complete: true, nextPageToken: null } }); });
  await page.reload();
  await page.evaluate(() => window.calendarFixture.navigate("week", "2026-10-15"));
  await page.getByRole("button", { name: "Calendar event panel", exact: true }).click();
  const upcoming = page.getByRole("region", { name: "Upcoming meeting", exact: true });
  await expect(upcoming).toContainText("Design review");
  await upcoming.getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Design review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Studio", exact: true })).toHaveAttribute("href", /google.com\/maps\/search/);
});

test("search finds distant events with explicit pagination and date filters", async ({ page }) => {
  const requests = [];
  await page.route("**/search?**", route => {
    const url = new URL(route.request().url()); requests.push(Object.fromEntries(url.searchParams));
    const later = { ...event, eventId: url.searchParams.has("pageToken") ? "second" : "distant", title: url.searchParams.has("pageToken") ? "Second distant review" : "Distant design review", start: { dateTime: "2028-03-12T04:30:00Z", timeZone: "Asia/Kolkata" }, end: { dateTime: "2028-03-12T05:30:00Z", timeZone: "Asia/Kolkata" } };
    return route.fulfill({ json: { events: [later], nextPageToken: url.searchParams.has("pageToken") ? null : "more" } });
  });
  await page.getByRole("textbox", { name: "Search calendar", exact: true }).fill("review");
  const results = page.getByRole("region", { name: "Calendar search results", exact: true });
  await expect(results.getByRole("button", { name: /Distant design review/ })).toBeVisible();
  expect(requests[0]).not.toHaveProperty("start");
  expect(requests[0]).not.toHaveProperty("end");
  await results.getByRole("button", { name: "Load more results" }).click();
  await expect(results.getByRole("button", { name: /Second distant review/ })).toBeVisible();
  await results.getByRole("button", { name: /Distant design review/ }).click();
  await expect(page.getByRole("heading", { name: "Distant design review" })).toBeVisible();
  await page.keyboard.press("Escape");
  await results.getByLabel("Search from date").fill("2028-01-01");
  await results.getByLabel("Search through date").fill("2028-12-31");
  await expect.poll(() => requests.at(-1)?.end).toContain("2028-12-31T18:30:00");
  expect(requests.at(-1)).not.toHaveProperty("pageToken");
});

test("Calendar command menu and shortcut help respect editing focus and capabilities", async ({ page }) => {
  await expect(page.getByRole("button", { name: /Design review/ })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Calendar commands" })).toBeVisible();
  await page.getByPlaceholder("Search Calendar commands…").fill("month");
  await page.getByRole("option", { name: "Switch to month view", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Calendar view" })).toContainText("Month");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Calendar shortcuts" })).toBeVisible();
  await page.getByPlaceholder("Search shortcuts and actions…").fill("Next event");
  await expect(page.getByRole("option", { name: "Next event J" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search calendar", exact: true }).fill("c");
  await page.keyboard.press("t");
  await expect(page.getByRole("textbox", { name: "Search calendar", exact: true })).toHaveValue("ct");
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.calendarFixture.offline());
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search Calendar commands…").fill("Create event");
  await expect(page.getByRole("option", { name: "Create event C", exact: true })).toHaveAttribute("aria-disabled", "true");
});
