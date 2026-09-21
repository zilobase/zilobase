import { app, safeStorage } from "electron";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { activeServer, desktopError, loadConfig } from "./server.mjs";

function profileKey(server) {
  return createHash("sha256").update(server.issuer + "\0" + server.instanceId).digest("hex");
}
function secretPath(server) {
  return path.join(app.getPath("userData"), "credentials", profileKey(server) + ".json");
}
function tombstonePath(server) {
  return path.join(app.getPath("userData"), "credentials", profileKey(server) + ".tombstone");
}
async function legacyCredential(server, key, operation) {
  if (process.env.ZILOBASE_E2E_USER_DATA && process.env.ZILOBASE_E2E_DISABLE_LEGACY === "1") return null;
  const name = "zilobase-desktop-sidecar" + (process.platform === "win32" ? ".exe" : "");
  const binary = app.isPackaged
    ? path.join(process.resourcesPath, "sidecar", name)
    : path.join(app.getAppPath(), "electron", "bin", name);
  if (!existsSync(binary)) {
    if (app.isPackaged || operation === "--delete-legacy-credential") {
      throw desktopError("platform_failure", "The credential migration helper is unavailable.");
    }
    return null;
  }
  const account = key + ":" + profileKey(server);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [operation, account], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks = [];
    let length = 0;
    child.stdout.on("data", (chunk) => {
      length += chunk.length;
      if (length > 16_384) child.kill();
      else chunks.push(chunk);
    });
    child.on("error", () => reject(desktopError("platform_failure", "The old credential store could not be read.")));
    child.on("exit", (code) => {
      if (code === 2 && operation === "--read-legacy-credential") return resolve(null);
      if (code !== 0 || length > 16_384) {
        return reject(desktopError("platform_failure", "The old credential store could not be read."));
      }
      if (operation === "--delete-legacy-credential") return resolve(null);
      try { resolve(Buffer.from(Buffer.concat(chunks).toString("utf8").trim(), "base64").toString("utf8")); }
      catch { reject(desktopError("platform_failure", "The old credential store returned invalid data.")); }
    });
  });
}
async function storageReady() {
  if (process.platform === "linux" && ["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend())) {
    throw desktopError("no_storage_access", "An OS secret store is required to save desktop sessions.");
  }
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw desktopError("no_storage_access", "Secure credential storage is unavailable.");
  }
}
async function readValues(server) {
  let bytes;
  try { bytes = await readFile(secretPath(server)); }
  catch (error) {
    if (error.code === "ENOENT") {
      if (existsSync(tombstonePath(server))) return {};
      const values = {};
      for (const key of ["session", "session-owner"]) {
        const value = await legacyCredential(server, key, "--read-legacy-credential");
        if (value) values[key] = value;
      }
      if (Object.keys(values).length) await writeValues(server, values);
      return values;
    }
    throw desktopError("platform_failure", "Desktop credentials could not be read.");
  }
  if (bytes.length > 32_768) throw desktopError("platform_failure", "Desktop credentials are invalid.");
  try {
    await storageReady();
    const encrypted = JSON.parse(bytes.toString("utf8"));
    const result = {};
    for (const key of ["session", "session-owner"]) {
      if (!encrypted[key]) continue;
      const value = await safeStorage.decryptStringAsync(Buffer.from(encrypted[key], "base64"));
      result[key] = value.result;
      if (value.shouldReEncrypt) result.needsRotation = true;
    }
    if (result.needsRotation) {
      delete result.needsRotation;
      await writeValues(server, result);
    }
    return result;
  } catch (error) {
    if (error?.code) throw error;
    throw desktopError("platform_failure", "Desktop credentials could not be decrypted.");
  }
}
async function writeValues(server, values) {
  await storageReady();
  const encrypted = {};
  for (const key of ["session", "session-owner"]) {
    if (values[key]) encrypted[key] = (await safeStorage.encryptStringAsync(values[key])).toString("base64");
  }
  const file = secretPath(server);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(encrypted), { mode: 0o600 });
  await rename(temporary, file);
}

export const credentials = {
  async get(server, key) {
    return (await readValues(server))[key] ?? null;
  },
  async set(server, key, value) {
    if (value !== null && (typeof value !== "string" || value.length > 8192)) {
      throw desktopError("invalid_argument", "Invalid credential value.");
    }
    const values = await readValues(server);
    if (value === null) delete values[key];
    else values[key] = value;
    await writeValues(server, values);
    if (value === null) {
      await mkdir(path.dirname(tombstonePath(server)), { recursive: true });
      await writeFile(tombstonePath(server), "", { mode: 0o600 });
    }
  },
  async setSession(server, token, owner) {
    const values = await readValues(server);
    values.session = token;
    values["session-owner"] = owner;
    await writeValues(server, values);
  },
  async delete(server) {
    for (const key of ["session", "session-owner"]) {
      await legacyCredential(server, key, "--delete-legacy-credential");
    }
    await mkdir(path.dirname(tombstonePath(server)), { recursive: true });
    await writeFile(tombstonePath(server), "", { mode: 0o600 });
    try { await unlink(secretPath(server)); }
    catch (error) {
      if (error.code !== "ENOENT") throw desktopError("credential_cleanup_failed", "Server credentials could not be removed.");
    }
  },
};

export function registerCredentialHandlers(handle) {
  handle("desktop:auth:get-token", async () => credentials.get(activeServer(await loadConfig()), "session"));
  handle("desktop:auth:set-token", async ({ token }) => credentials.set(activeServer(await loadConfig()), "session", token));
  handle("desktop:auth:get-owner", async () => credentials.get(activeServer(await loadConfig()), "session-owner"));
  handle("desktop:auth:set-owner", async ({ owner }) => credentials.set(activeServer(await loadConfig()), "session-owner", owner));
}
