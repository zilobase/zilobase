import type {
  useAddDatabaseProperty,
  useAddDatabaseRow,
  useAddDatabaseView,
  useUpdateDataSource,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
  useUpdateDatabaseView,
} from "@zilobase/features/databases/react";
import type { useUpdatePage } from "@zilobase/features/pages/react";

export type DatabaseRowMutations = {
  addRow: ReturnType<typeof useAddDatabaseRow>
  updateValue: ReturnType<typeof useUpdateDatabasePropertyValue>
}

export type DatabasePropertyMutations = {
  addProperty: ReturnType<typeof useAddDatabaseProperty>
  updateProperty: ReturnType<typeof useUpdateDatabaseProperty>
}

export type DatabaseViewMutations = {
  addDatabaseView: ReturnType<typeof useAddDatabaseView>
  updateDatabase: ReturnType<typeof useUpdateDataSource>
  updateDatabaseView: ReturnType<typeof useUpdateDatabaseView>
}

export type DatabasePageMutations = {
  updatePage: ReturnType<typeof useUpdatePage>
}

export type DatabaseMutations = DatabasePageMutations &
  DatabasePropertyMutations &
  DatabaseRowMutations &
  DatabaseViewMutations
