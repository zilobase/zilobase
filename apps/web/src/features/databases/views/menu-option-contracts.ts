import type { ReactNode } from "react";
import type { DatabaseFieldOption } from "./model/field-option";

export type DatabaseSearchableMenuOption = Omit<DatabaseFieldOption, "fieldIcon"> & {
  icon?: ReactNode;
};
