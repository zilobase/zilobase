#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { _electron } from "playwright";

const executablePath = process.env.ZILOBASE_DESKTOP_BINARY;
assert.ok(executablePath, "ZILOBASE_DESKTOP_BINARY is required");
const serverOrigin = requiredOrigin("ZILOBASE_E2E_SERVER");
const diagnosticsDirectory = path.resolve(process.env.ZILOBASE_DESKTOP_DIAGNOSTICS_DIR || "artifacts/electron-selfhost");
const userData = await mkdtemp(path.join(os.tmpdir(), "zilobase-electron-selfhost-"));
let desktop;
let page;

try {
  await mkdir(diagnosticsDirectory, { recursive: true });
  desktop = await _electron.launch({
    executablePath,
    env: { ...process.env, ZILOBASE_E2E_USER_DATA: userData, ZILOBASE_E2E_DISABLE_LEGACY: "1" },
    timeout: 30_000,
  });
  desktop.process().stdout?.on("data", (chunk) => process.stdout.write(chunk));
  desktop.process().stderr?.on("data", (chunk) => process.stderr.write(chunk));
  page = await desktop.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  assert.equal(await page.evaluate(() => window.zilobaseDesktop?.apiVersion), 1);
  await selectServer(serverOrigin);

  const additionalServer = process.env.ZILOBASE_E2E_ADDITIONAL_SERVER?.trim();
  if (additionalServer) await selectServer(requiredOrigin("ZILOBASE_E2E_ADDITIONAL_SERVER"));
  console.info(`Packaged Electron desktop connected to ${serverOrigin}.`);
} catch (error) {
  if (page) {
    const state = await page.evaluate(() => ({
      path: location.pathname,
      text: document.body.innerText.slice(0, 2_000),
    })).catch(() => undefined);
    if (state) console.error("Electron failure state:", state);
    await page.screenshot({ path: path.join(diagnosticsDirectory, "electron-failure.png") }).catch(() => undefined);
  }
  throw error;
} finally {
  if (desktop) await desktop.close().catch(() => undefined);
  await rm(userData, { recursive: true, force: true });
}

async function selectServer(origin) {
  let input = page.locator("#desktop-server-url");
  if (!(await input.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Change server" }).or(
      page.getByRole("link", { name: "Change server" }),
    ).first().click({ timeout: 30_000 });
    input = page.locator("#desktop-server-url");
  }
  await input.fill(origin, { timeout: 30_000 });
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.getByText(origin, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Continue in Browser" }).waitFor({ state: "visible", timeout: 10_000 });
  const selected = await page.evaluate(() => window.zilobaseDesktop.server.initialize());
  assert.equal(selected.apiOrigin, origin);
}

function requiredOrigin(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  const url = new URL(value);
  assert.equal(url.toString(), `${url.origin}/`);
  return url.origin;
}
