import type { DatabasePropertyFilterOperator, DatabaseSortDirection } from "./database-view-config";

export type DatabaseCondition = {
  id: string;
  label: string;
  operator: DatabasePropertyFilterOperator;
  operatorLabel: string;
  propertyId: string;
  propertyType: string;
  values: string[];
};

export type DatabaseConditionUpdatePatch = {
  operator?: DatabasePropertyFilterOperator;
  propertyId?: string;
  values?: string[];
};

export type DatabaseActiveFilter = DatabaseCondition;

export type DatabaseFilterUpdatePatch = DatabaseConditionUpdatePatch;

export type DatabaseActiveSort = {
  column: string;
  direction: DatabaseSortDirection;
  label: string;
};

export type DatabaseSortUpdatePatch = {
  column?: string;
  direction?: DatabaseSortDirection;
};
