import { LinearClient } from "@linear/sdk";

import type {
  LinearWorkspaceSummary,
  LinearViewerSummary,
} from "./types.js";

export type LinearReadonlyClientOptions = {
  accessToken: string;
};

export class LinearReadonlyClient {
  readonly client: LinearClient;

  constructor({ accessToken }: LinearReadonlyClientOptions) {
    this.client = new LinearClient({ accessToken });
  }

  async getViewer(): Promise<LinearViewerSummary> {
    const viewer = await this.client.viewer;

    return {
      displayName: viewer.displayName ?? undefined,
      email: viewer.email ?? undefined,
      id: viewer.id,
      name: viewer.name ?? undefined,
    };
  }

  async getOrganization(): Promise<LinearWorkspaceSummary> {
    const workspace = await this.client.organization;

    return {
      id: workspace.id,
      name: workspace.name ?? undefined,
      urlKey: workspace.urlKey ?? undefined,
    };
  }
}
