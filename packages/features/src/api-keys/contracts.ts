export type ApiKeyRecord = {
  createdAt: string;
  enabled: boolean;
  expiresAt: string | null;
  id: string;
  lastRequest: string | null;
  name: string;
  workspaceId: string | null;
  prefix: string | null;
  requestCount: number;
  start: string | null;
  updatedAt: string;
};

export type ApiKeysResponse = {
  keys: ApiKeyRecord[];
};

export type CreatedApiKeyRecord = ApiKeyRecord & {
  key: string;
};
