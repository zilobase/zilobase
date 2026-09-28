import type {
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useChangeDatabaseRow,
  useAddDatabaseView,
  useUpdateDataSource,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
  useUpdateDatabaseView,
} from "@zilobase/features/databases/react";

export type DatabaseRowMutations = {
  addRow: ReturnType<typeof useAddDatabaseRow>;
  changeRow: ReturnType<typeof useChangeDatabaseRow>;
  updateValue: ReturnType<typeof useUpdateDatabasePropertyValue>;
};

export type DatabasePropertyMutations = {
  addProperty: ReturnType<typeof useAddDatabaseProperty>;
  updateProperty: ReturnType<typeof useUpdateDatabaseProperty>;
};

export type DatabaseViewMutations = {
  addDatabaseView: ReturnType<typeof useAddDatabaseView>;
  updateDatabase: ReturnType<typeof useUpdateDataSource>;
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>;
};

export type DatabaseMutations = DatabasePropertyMutations &
  DatabaseRowMutations &
  DatabaseViewMutations;
