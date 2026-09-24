export type DatabaseFieldOption = {
  color?: string;
  fieldIcon?: { kind: "name" } | { kind: "property"; propertyType: string };
  label: string;
  searchText?: string;
  value: string;
};
