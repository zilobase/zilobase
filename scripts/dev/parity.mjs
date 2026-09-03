import { createConnection } from "node:net";

import { localProfiles, runtimeUrl } from "./config.mjs";
import { loadProfileEnvironment } from "./env.mjs";
import { effectiveProfile } from "./local.mjs";

export async function testRuntimeParity(target = "all") {
  const names = target === "all" ? ["node", "worker"] : [target];
  if (names.some((name) => !localProfiles[name])) {
    throw new Error("Parity target must be node, worker, or all.");
  }
  const profiles = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    effectiveProfile(name, await loadProfileEnvironment(name)),
  ])));
  const results = {};
  for (const [name, profile] of Object.entries(profiles)) {
    const ready = await getJson(`http://127.0.0.1:${profile.apiPort}/ready`);
    if (!ready.ok) throw new Error(`${name} readiness payload did not report ok.`);
    if (ready.checks?.objectStorage && ready.checks.objectStorage !== "ok") {
      throw new Error(`${name} object storage is not ready.`);
    }
    const discovery = await getJson(
      `http://127.0.0.1:${profile.apiPort}/.well-known/zilobase`,
    );
    const web = await fetch(`http://127.0.0.1:${profile.appPort}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!web.ok) throw new Error(`${name} web client returned HTTP ${web.status}.`);
    const demo = await getJson(`http://127.0.0.1:${profile.apiPort}/demo/bootstrap`, {
      headers: { "x-zilobase-demo": "1" },
    });
    if (!demo.workspace?.id) throw new Error(`${name} common API demo workspace is unavailable.`);
    await verifyRealtimeGuard(profile);
    results[name] = { discovery, ready };
    console.info(`✓ ${name} API, storage, realtime, discovery, and web client`);
  }

  const nodeId = results.node?.discovery.instanceId;
  const workerId = results.worker?.discovery.instanceId;
  if (nodeId && workerId && nodeId === workerId) {
    throw new Error("Node and Worker returned the same instance ID; their databases are not isolated.");
  }
  if (profiles.node) {
    const background = await fetch(
      `http://127.0.0.1:${profiles.node.healthPort}/ready`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!background.ok) {
      throw new Error(`Node background coordinator returned HTTP ${background.status}.`);
    }
    console.info("✓ Node background coordinator");
  }
  if (profiles.worker) {
    const scheduled = await fetch(
      `http://127.0.0.1:${profiles.worker.backgroundPort}/__scheduled`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!scheduled.ok) {
      throw new Error(`Worker scheduled handler returned HTTP ${scheduled.status}.`);
    }
    console.info("✓ Worker scheduled delivery");
  }
  if (nodeId && workerId) console.info("✓ isolated runtime identities");
  for (const [name, profile] of Object.entries(profiles)) {
    console.info(`${name}: ${runtimeUrl(profile)}`);
  }
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function verifyRealtimeGuard(profile) {
  const status = await new Promise((resolve, reject) => {
    const socket = createConnection(profile.apiPort, "127.0.0.1", () => {
      socket.write([
        "GET /collaboration?document=runtime-parity-probe HTTP/1.1",
        `Host: 127.0.0.1:${profile.apiPort}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Protocol: zilobase.collaboration.v1",
        "",
        "",
      ].join("\r\n"));
    });
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${profile.name} realtime upgrade timed out.`));
    }, 10_000);
    socket.on("data", (chunk) => {
      response += chunk;
      const line = response.split("\r\n", 1)[0];
      const match = line.match(/^HTTP\/1\.1 (\d{3})/);
      if (!match) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve(Number(match[1]));
    });
    socket.once("error", reject);
  });
  if (status !== 400 && status !== 401) {
    throw new Error(
      `${profile.name} unauthenticated realtime upgrade returned HTTP ${status}.`,
    );
  }
}
