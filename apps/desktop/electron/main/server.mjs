import { app } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import semver from "semver";

const CLOUD_API = "https://api.zilobase.com";
const CLOUD_WEB = "https://app.zilobase.com";
const CANDIDATE_TTL = 300_000;
const candidates = new Map();

export function desktopError(code, safeMessage) {
  return Object.assign(new Error(safeMessage), { code, safeMessage });
}

function configName() {
  return app.isPackaged ? "desktop-server.json" : "desktop-server.dev.json";
}

function configPath() {
  return path.join(app.getPath("userData"), configName());
}

function builtInServer() {
  if (!app.isPackaged) {
    const origin = process.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3000";
    return {
      instanceId: "zilobase-dev", displayName: "Zilobase Cloud",
      issuer: origin, apiOrigin: origin, webOrigin: origin, protocolVersion: 1,
      serverVersion: app.getVersion(), minimumDesktopVersion: app.getVersion(),
    };
  }
  return {
    instanceId: "zilobase-cloud", displayName: "Zilobase Cloud",
    issuer: CLOUD_API, apiOrigin: CLOUD_API, webOrigin: CLOUD_WEB, protocolVersion: 1,
    serverVersion: app.getVersion(), minimumDesktopVersion: app.getVersion(),
  };
}

function originOf(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw desktopError("invalid_server_url", "Enter a complete server URL."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw desktopError("invalid_server_url", "Enter a canonical HTTPS server origin, or loopback HTTP.");
  }
  return url.origin;
}

function validateServer(server, checkMinimum = false) {
  if (!server || typeof server !== "object" ||
      typeof server.instanceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(server.instanceId) ||
      typeof server.displayName !== "string" || !server.displayName.trim() || server.displayName.length > 100 ||
      server.protocolVersion !== 1 ||
      typeof server.apiOrigin !== "string" || originOf(server.apiOrigin) !== server.apiOrigin ||
      typeof server.webOrigin !== "string" || originOf(server.webOrigin) !== server.webOrigin ||
      server.issuer !== server.apiOrigin ||
      !semver.valid(server.serverVersion) || !semver.valid(server.minimumDesktopVersion)) {
    throw desktopError("invalid_server_metadata", "The server metadata is invalid.");
  }
  if (checkMinimum && semver.lt(app.getVersion(), server.minimumDesktopVersion)) {
    throw desktopError("desktop_update_required", "This server requires a newer Zilobase Desktop.");
  }
  return server;
}

function validateConfig(config) {
  if (!config || config.version !== 2 || !Array.isArray(config.profiles) || !config.profiles.length ||
      typeof config.active_instance_id !== "string") {
    throw desktopError("server_configuration_error", "The saved desktop server configuration is invalid.");
  }
  for (const profile of config.profiles) {
    validateServer(profile.server);
    if (!Array.isArray(profile.workspaces) || profile.workspaces.length > 50) {
      throw desktopError("server_configuration_error", "The saved workspace snapshot is invalid.");
    }
  }
  if (!config.profiles.some((profile) => profile.server.instanceId === config.active_instance_id)) {
    config.active_instance_id = config.profiles[0].server.instanceId;
  }
  return config;
}

async function readConfigFile(file) {
  const bytes = await readFile(file);
  if (bytes.length > 65_536) throw desktopError("server_configuration_error", "The saved configuration is too large.");
  try { return validateConfig(JSON.parse(bytes.toString("utf8"))); }
  catch (error) {
    if (error?.code) throw error;
    throw desktopError("server_configuration_error", "The saved configuration is malformed.");
  }
}

async function writeConfig(config) {
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, file);
}

function loopbackOrigin(value) {
  if (typeof value !== "string") return null;
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.origin !== trimmed.replace(/\/$/, "") || url.username || url.password ||
        url.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function developmentTargets() {
  if (app.isPackaged) return { cloudApiOrigin: null, customServers: [] };
  let customServers = [];
  try {
    const parsed = JSON.parse(process.env.ZILOBASE_DESKTOP_DEV_SERVERS || "[]");
    if (Array.isArray(parsed)) {
      customServers = parsed.flatMap((item) => {
        const url = loopbackOrigin(item?.url);
        const label = typeof item?.label === "string" ? item.label.trim().replace(/\s+/g, " ") : "";
        return url && label && label.length <= 80 ? [{ label, url }] : [];
      }).slice(0, 8);
    }
  } catch {
    customServers = [];
  }
  return { cloudApiOrigin: loopbackOrigin(process.env.VITE_API_URL), customServers };
}

async function alignUnpackagedCloud(config) {
  if (app.isPackaged) return false;
  const desired = builtInServer();
  let changed = false;
  for (const profile of config.profiles) {
    if (profile.server.instanceId !== "zilobase-dev") continue;
    if (profile.server.apiOrigin === desired.apiOrigin && profile.server.issuer === desired.issuer &&
        profile.server.webOrigin === desired.webOrigin) continue;
    profile.server = desired;
    changed = true;
  }
  if (changed) await writeConfig(config);
  return changed;
}

export async function loadConfig() {
  const file = configPath();
  if (existsSync(file)) {
    const config = await readConfigFile(file);
    await alignUnpackagedCloud(config);
    return config;
  }
  const server = builtInServer();
  const config = { version: 2, active_instance_id: server.instanceId, profiles: [
    { server, workspaces: [] },
  ] };
  await writeConfig(config);
  return config;
}

export function activeServer(config) {
  return config.profiles.find((profile) => profile.server.instanceId === config.active_instance_id)?.server ||
    config.profiles[0].server;
}

async function verifyServer(input) {
  const origin = originOf(input);
  if (origin === CLOUD_API || origin === CLOUD_WEB) return builtInServer();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(origin + "/.well-known/zilobase", {
      redirect: "manual", signal: controller.signal,
      headers: { "user-agent": "Zilobase Desktop/" + app.getVersion() },
    });
    if (response.status >= 300 && response.status < 400) {
      throw desktopError("invalid_server_metadata", "The server redirected its discovery document.");
    }
    if (response.status !== 200) throw desktopError("discovery_unavailable", "The server discovery document is unavailable.");
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw desktopError("invalid_server_metadata", "The server discovery response is not JSON.");
    }
    if (Number(response.headers.get("content-length") || 0) > 65_536) {
      throw desktopError("invalid_server_metadata", "The server discovery response is too large.");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65_536) throw desktopError("invalid_server_metadata", "The server discovery response is too large.");
      chunks.push(value);
    }
    const discovery = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const server = validateServer(discovery, true);
    if (server.apiOrigin !== origin ||
        discovery.desktopAuthorization?.authorizationEndpoint !== origin + "/desktop/authorize" ||
        discovery.desktopAuthorization?.tokenEndpoint !== origin + "/api/auth/desktop/token") {
      throw desktopError("invalid_server_metadata", "The server discovery endpoints are not canonical.");
    }
    const { instanceId, displayName, issuer, webOrigin, apiOrigin, protocolVersion, serverVersion, minimumDesktopVersion } = server;
    return { instanceId, displayName, issuer, webOrigin, apiOrigin, protocolVersion, serverVersion, minimumDesktopVersion };
  } catch (error) {
    if (error?.code) throw error;
    throw desktopError("network_error", "The server could not be verified.");
  } finally {
    clearTimeout(timer);
  }
}

function profileMatch(profile, instanceId, apiOrigin) {
  return profile.server.instanceId === instanceId && profile.server.apiOrigin === apiOrigin;
}
function activeProfile(config) {
  return config.profiles.find((profile) => profile.server.instanceId === config.active_instance_id) || config.profiles[0];
}

export function registerServerHandlers(handle, credentials) {
  handle("desktop:server:initialize", async () => activeServer(await loadConfig()));
  handle("desktop:server:development-targets", () => developmentTargets());
  handle("desktop:server:prepare", async ({ serverUrl }) => {
    const server = await verifyServer(serverUrl);
    const candidateId = randomBytes(16).toString("hex");
    for (const [id, candidate] of candidates) {
      if (Date.now() - candidate.verifiedAt > CANDIDATE_TTL) candidates.delete(id);
    }
    if (candidates.size >= 8) candidates.clear();
    candidates.set(candidateId, { server, verifiedAt: Date.now() });
    return { candidateId, server };
  });
  handle("desktop:server:discard", ({ candidateId }) => { candidates.delete(candidateId); });
  handle("desktop:server:commit", async ({ candidateId }) => {
    const candidate = candidates.get(candidateId);
    if (!candidate || Date.now() - candidate.verifiedAt > CANDIDATE_TTL) {
      candidates.delete(candidateId);
      throw desktopError("server_candidate_expired", "Verify the server again before changing connections.");
    }
    const config = await loadConfig();
    const current = activeServer(config);
    const changed = current.instanceId !== candidate.server.instanceId || current.apiOrigin !== candidate.server.apiOrigin;
    const profile = config.profiles.find((item) => profileMatch(item, candidate.server.instanceId, candidate.server.apiOrigin));
    if (profile) profile.server = candidate.server;
    else config.profiles.push({ server: candidate.server, workspaces: [] });
    config.active_instance_id = candidate.server.instanceId;
    await writeConfig(config);
    candidates.delete(candidateId);
    return { changed, server: candidate.server };
  });
  handle("desktop:server:list", async () => {
    const config = await loadConfig();
    return { activeInstanceId: config.active_instance_id, profiles: await Promise.all(config.profiles.map(async (profile) => ({
      active: profile.server.instanceId === config.active_instance_id,
      hasCredentials: Boolean(await credentials.get(profile.server, "session")),
      lastActiveWorkspaceId: profile.lastActiveWorkspaceId ?? null,
      lastPath: profile.lastPath ?? null,
      lastUsedAt: profile.lastUsedAt ?? null,
      server: profile.server,
      workspaces: profile.workspaces,
    }))) };
  });
  handle("desktop:server:switch", async ({ instanceId, apiOrigin, workspaceId, path: route }) => {
    const config = await loadConfig();
    const profile = config.profiles.find((item) => profileMatch(item, instanceId, apiOrigin));
    if (!profile) throw desktopError("server_profile_not_found", "That saved server is unavailable.");
    if (typeof workspaceId === "string" && workspaceId.length <= 128) profile.lastActiveWorkspaceId = workspaceId;
    if (typeof route === "string" && route.startsWith("/") && !route.startsWith("//") && route.length <= 4096) profile.lastPath = route;
    config.active_instance_id = profile.server.instanceId;
    await writeConfig(config);
    return profile.server;
  });
  handle("desktop:server:update-snapshot", async ({ workspaces, lastActiveWorkspaceId, lastPath }) => {
    const config = await loadConfig();
    const profile = activeProfile(config);
    profile.workspaces = Array.isArray(workspaces) ? workspaces
      .filter((item) => item && typeof item.id === "string" && typeof item.name === "string" &&
        item.id.trim() && item.name.trim() && item.id.length <= 128 && item.name.length <= 200)
      .slice(0, 50) : [];
    profile.lastActiveWorkspaceId = typeof lastActiveWorkspaceId === "string" && lastActiveWorkspaceId.length <= 128 ? lastActiveWorkspaceId : null;
    profile.lastPath = typeof lastPath === "string" && lastPath.startsWith("/") && !lastPath.startsWith("//") && lastPath.length <= 4096 ? lastPath : null;
    profile.lastUsedAt = String(Math.floor(Date.now() / 1000));
    await writeConfig(config);
  });
  handle("desktop:server:remove", async ({ instanceId, apiOrigin }) => {
    const config = await loadConfig();
    const index = config.profiles.findIndex((item) => profileMatch(item, instanceId, apiOrigin));
    if (index < 0) throw desktopError("server_profile_not_found", "That saved server is unavailable.");
    const server = config.profiles[index].server;
    await credentials.delete(server);
    config.profiles.splice(index, 1);
    if (!config.profiles.length) config.profiles.push({ server: builtInServer(), workspaces: [] });
    if (!config.profiles.some((profile) => profile.server.instanceId === config.active_instance_id)) {
      config.active_instance_id = config.profiles[0].server.instanceId;
    }
    await writeConfig(config);
    return activeServer(config);
  });
}
