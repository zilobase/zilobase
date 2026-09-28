import type { DatabaseCommand } from "../core/entities";

export type CommandPolicy = {
  scope: "workspace" | "host" | "source";
  preview: "record" | "metadata" | "confirmed";
};

/** Exhaustive ownership registry; adding a command requires declaring its policy. */
export const databaseCommandPolicies = {
  "database.create": { scope: "workspace", preview: "confirmed" },
  "database.archive": { scope: "host", preview: "confirmed" },
  "database.restore": { scope: "host", preview: "confirmed" },
  "database.favorite": { scope: "host", preview: "metadata" },
  "access.upsert": { scope: "host", preview: "confirmed" },
  "access.remove": { scope: "host", preview: "confirmed" },
  "database.publish": { scope: "host", preview: "confirmed" },
  "database.update": { scope: "host", preview: "metadata" },
  "dataSource.create": { scope: "host", preview: "confirmed" },
  "dataSource.link": { scope: "host", preview: "confirmed" },
  "dataSource.unlink": { scope: "host", preview: "confirmed" },
  "dataSource.update": { scope: "source", preview: "metadata" },
  "view.create": { scope: "host", preview: "confirmed" },
  "view.update": { scope: "host", preview: "metadata" },
  "view.move": { scope: "host", preview: "metadata" },
  "view.delete": { scope: "host", preview: "confirmed" },
  "view.setDataSource": { scope: "host", preview: "confirmed" },
  "property.create": { scope: "source", preview: "metadata" },
  "property.update": { scope: "source", preview: "metadata" },
  "property.move": { scope: "source", preview: "metadata" },
  "property.archive": { scope: "source", preview: "confirmed" },
  "property.restore": { scope: "source", preview: "confirmed" },
  "property.duplicate": { scope: "source", preview: "confirmed" },
  "template.create": { scope: "source", preview: "confirmed" },
  "template.update": { scope: "source", preview: "confirmed" },
  "template.archive": { scope: "source", preview: "confirmed" },
  "template.restore": { scope: "source", preview: "confirmed" },
  "template.apply": { scope: "source", preview: "confirmed" },
  "row.change": { scope: "source", preview: "record" },
  "row.place": { scope: "source", preview: "record" },
  "row.archive": { scope: "source", preview: "record" },
  "row.restore": { scope: "source", preview: "record" },
} as const satisfies Record<DatabaseCommand["type"], CommandPolicy>;
