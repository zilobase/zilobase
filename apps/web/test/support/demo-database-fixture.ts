import type {
  DatabaseBootstrapResponse,
  DatabaseRecordWindowResponse,
} from "@zilobase/features/databases/contracts";
import { databaseViewQueryHash } from "@zilobase/features/databases/query-hash";

export function demoDatabaseFixture() {
  const timestamp = "2026-09-29T00:00:00.000Z";
  const dates = { createdAt: timestamp, updatedAt: timestamp };
  const bootstrap: DatabaseBootstrapResponse = {
    database: {
      ...dates,
      id: "demo-db",
      name: "Demo",
      version: 4,
      workspaceId: "demo-workspace",
      config: {},
      pageId: null,
      accessLevel: "full",
      deletedAt: null,
    },
    dataSources: [
      {
        ...dates,
        id: "demo-source",
        name: "Tasks",
        version: 7,
        configVersion: 0,
        config: {},
        position: 0,
        parentDatabaseId: "demo-db",
        workspaceId: "demo-workspace",
        linkedAt: null,
      },
    ],
    views: ["table", "kanban"].map((type, position) => ({
      ...dates,
      id: type,
      name: type,
      type,
      position,
      config: {},
      databaseId: "demo-db",
      dataSourceId: "demo-source",
    })),
    properties: [
      {
        ...dates,
        id: "column",
        dataSourceId: "demo-source",
        propertyId: "demo-status",
        position: 0,
        visible: true,
        width: null,
        property: {
          ...dates,
          id: "demo-status",
          name: "Status",
          type: "text",
          config: {},
          workspaceId: "demo-workspace",
        },
      },
    ],
  };
  const window: DatabaseRecordWindowResponse = {
    queryHash: databaseViewQueryHash({}),
    databaseVersion: 4,
    dataSourceVersion: 7,
    offset: 0,
    totalCount: 2,
    hasMore: false,
    snapshot: "server-snapshot",
    records: ["demo-row", "other-row"].map((id, position) => ({
      ...dates,
      id,
      dataSourceId: "demo-source",
      pageId: `page-${id}`,
      parentRowId: null,
      orderKey: String((position + 1) * 1024),
      valuesByPropertyId: {},
      page: {
        ...dates,
        id: `page-${id}`,
        name: id,
        hasContent: false,
        deletedAt: null,
        metadata: null,
      },
    })),
  };
  return { bootstrap, window };
}
