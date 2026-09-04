import path from "node:path";
import { fileURLToPath } from "node:url";

export const coreDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const platformDir = path.dirname(coreDir);
export const adapterDir = path.resolve(
  process.env.ZILOBASE_ADAPTER_DIR ?? path.join(platformDir, "zilobase-cloud-adapter"),
);

export const stateDir = path.resolve(
  process.env.ZILOBASE_DEV_STATE_DIR ?? path.join(coreDir, ".dev", "local"),
);
export const envDir = path.join(stateDir, "env");
export const runtimeStateFile = path.join(stateDir, "runtime.json");
export const composeFile = path.join(coreDir, "scripts", "dev", "dependencies.compose.yml");
export const composeProject = "zilobase-source-dev";
export const kindCluster = "zilobase-community-dev";

export const repoEnvironmentFiles = {
  node: path.join(coreDir, ".env.development"),
  worker: path.join(adapterDir, ".env.development"),
};

export const generatedEnvironmentFiles = {
  dependencies: path.join(envDir, "dependencies.env"),
  node: path.join(envDir, "node.env"),
  worker: path.join(envDir, "worker.env"),
  kubernetes: path.join(envDir, "kubernetes.env"),
};

export const localProfiles = {
  node: {
    name: "node",
    appHost: "localhost",
    appPort: 1420,
    apiHost: "localhost",
    apiPort: 3000,
    healthPort: 3001,
    inspectorPort: 9229,
    database: "zilobase_node",
    bucket: "zilobase-node",
    cellId: "local-node",
  },
  worker: {
    name: "worker",
    appHost: "127.0.0.1",
    appPort: 1422,
    apiHost: "127.0.0.1",
    apiPort: 3010,
    backgroundPort: 3012,
    inspectorPort: 9231,
    backgroundInspectorPort: 9232,
    database: "zilobase_worker",
    cellId: "local-worker",
  },
};

export const kubernetesProfiles = {
  community: {
    namespace: "zilobase-community-dev",
    release: "community",
    appHost: "community.zilobase.localhost",
    appPort: 3200,
    inspectorPort: 9233,
    mailpitPort: 3225,
  },
};

export function runtimeUrl(profile) {
  return `http://${profile.appHost}:${profile.appPort}`;
}

export function apiUrl(profile) {
  return `http://${profile.apiHost}:${profile.apiPort}`;
}
