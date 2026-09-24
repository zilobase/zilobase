import type {
  MailFilterCondition,
  MailFilterOperator,
  MailFilterValue,
} from "@zilobase/features/mail";
import {
  getDatabaseFilterOperatorsForType,
  type DatabasePropertyFilterOperator,
} from "@/features/databases/views/model/database-view-config";

type FilterProperty = {
  id: string;
  propertyType: string;
  valueOptions: Array<{ value: string }>;
};
type ConditionPatch = {
  operator?: DatabasePropertyFilterOperator;
  propertyId?: string;
  values?: string[];
};

export function defaultMailFilterValue(property: FilterProperty | undefined): MailFilterValue {
  if (property?.propertyType === "checkbox") return true;
  return property?.valueOptions[0]?.value ?? "";
}

function replacementOperator(propertyId: string, property: FilterProperty | undefined) {
  if (propertyId === "categories") return "contains";
  return getDatabaseFilterOperatorsForType(property?.propertyType ?? "text")[0]?.value;
}

function coerceFilterValue(value: string, property: FilterProperty | undefined): MailFilterValue {
  if (property?.propertyType === "checkbox") return value === "true";
  if (property?.propertyType === "number") return Number(value);
  return value;
}

export function changeMailFilterCondition(
  condition: MailFilterCondition,
  patch: ConditionPatch,
  properties: FilterProperty[],
): MailFilterCondition {
  const propertyId = patch.propertyId ?? condition.propertyId;
  const property = properties.find((item) => item.id === propertyId);
  const operator =
    (patch.propertyId ? replacementOperator(propertyId, property) : patch.operator) ??
    condition.operator;
  const rawValues = patch.propertyId
    ? [String(defaultMailFilterValue(property))]
    : (patch.values ?? condition.values.map(String));
  return {
    ...condition,
    propertyId,
    operator: operator as MailFilterOperator,
    values: rawValues.map((value) => coerceFilterValue(value, property)),
  };
}
