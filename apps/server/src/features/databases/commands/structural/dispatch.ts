import type {
  DataSourceCommand,
  HostDatabaseCommand,
} from "@zilobase/features/databases/contracts";

import type {
  DatabaseCommandContext,
  DatabaseCommandDispatchResult,
} from "../framework";
import { databaseUpdate } from "./databases";
import {
  dataSourceCreate,
  dataSourceLink,
  dataSourceUnlink,
  dataSourceUpdate,
  viewSetDataSource,
} from "./data-sources";
import {
  propertyCreate,
  propertyDuplicate,
  propertyMove,
  propertyState,
  propertyUpdate,
} from "./properties";
import { templateWrite } from "./templates";
import {
  viewCreate,
  viewDelete,
  viewMove,
  viewUpdate,
} from "./views";

export async function dispatchStructuralCommand(
  context: DatabaseCommandContext,
  command: HostDatabaseCommand | DataSourceCommand,
): Promise<DatabaseCommandDispatchResult | null> {
  switch (command.type) {
    case "database.update": return databaseUpdate(context, command)
    case "dataSource.create": return dataSourceCreate(context, command)
    case "dataSource.link": return dataSourceLink(context, command)
    case "dataSource.unlink": return dataSourceUnlink(context, command)
    case "view.create": return viewCreate(context, command)
    case "view.update": return viewUpdate(context, command)
    case "view.move": return viewMove(context, command)
    case "view.delete": return viewDelete(context, command)
    case "view.setDataSource": return viewSetDataSource(context, command)
    case "dataSource.update": return dataSourceUpdate(context, command)
    case "property.create": return propertyCreate(context, command)
    case "property.update": return propertyUpdate(context, command)
    case "property.move": return propertyMove(context, command)
    case "property.duplicate": return propertyDuplicate(context, command)
    case "property.archive":
    case "property.restore": return propertyState(context, command)
    case "template.create":
    case "template.update":
    case "template.archive":
    case "template.restore": return templateWrite(context, command)
    case "template.apply": {
      const { applyTemplate } = await import("../template-apply-handler")
      return applyTemplate(context, command)
    }
    default: return null
  }
}
