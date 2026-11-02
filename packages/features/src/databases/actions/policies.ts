import type { DatabaseCommand } from "../core/entities";

export type DatabaseCommandActionPolicy =
  | { exposure: "action"; effect: "write" | "destructive" }
  | { exposure: "excluded"; reason: string };

/**
 * Exhaustive declaration of how each database command is exposed to
 * workspace actions. Adding a command fails to compile until it is declared.
 */
export const databaseCommandActionPolicies = {
  "database.create": { exposure: "action", effect: "write" },
  "database.archive": { exposure: "action", effect: "destructive" },
  "database.restore": { exposure: "action", effect: "write" },
  "database.favorite": { exposure: "action", effect: "write" },
  "access.upsert": { exposure: "excluded", reason: "Sharing is outside the action catalog" },
  "access.remove": { exposure: "excluded", reason: "Sharing is outside the action catalog" },
  "database.publish": { exposure: "excluded", reason: "Publishing is outside the action catalog" },
  "database.update": {
    exposure: "excluded",
    reason: "Host relocation moves pages; renames use dataSource.update",
  },
  "dataSource.create": { exposure: "action", effect: "write" },
  "dataSource.link": { exposure: "action", effect: "write" },
  "dataSource.unlink": { exposure: "action", effect: "destructive" },
  "dataSource.update": { exposure: "action", effect: "write" },
  "view.create": { exposure: "action", effect: "write" },
  "view.update": { exposure: "action", effect: "write" },
  "view.move": { exposure: "action", effect: "write" },
  "view.delete": { exposure: "action", effect: "destructive" },
  "view.setDataSource": { exposure: "action", effect: "destructive" },
  "property.create": { exposure: "action", effect: "write" },
  "property.update": { exposure: "action", effect: "write" },
  "property.move": { exposure: "action", effect: "write" },
  "property.archive": { exposure: "action", effect: "destructive" },
  "property.restore": { exposure: "action", effect: "write" },
  "property.duplicate": { exposure: "action", effect: "write" },
  "template.create": { exposure: "action", effect: "write" },
  "template.update": { exposure: "action", effect: "write" },
  "template.archive": { exposure: "action", effect: "destructive" },
  "template.restore": { exposure: "action", effect: "write" },
  "template.apply": { exposure: "action", effect: "write" },
  "row.change": { exposure: "action", effect: "write" },
  "row.place": { exposure: "action", effect: "write" },
  "row.archive": { exposure: "action", effect: "destructive" },
  "row.restore": { exposure: "action", effect: "write" },
  "row.duplicate": { exposure: "action", effect: "write" },
  "row.moveToPage": { exposure: "excluded", reason: "Not undoable yet" },
} as const satisfies Record<DatabaseCommand["type"], DatabaseCommandActionPolicy>;
