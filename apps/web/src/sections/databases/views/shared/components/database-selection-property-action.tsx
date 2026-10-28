import { useState } from "react";
import { Check, Minus } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { DatabasePropertyDate } from "../../../properties/editors/components/database-property-date";
import { DatabasePropertySelect } from "../../../properties/editors/components/database-property-select";
import {
  getEffectiveStatusValue,
  defaultStatusOptions,
  getPersonLimit,
  type DatabasePropertyValue,
  type DatabasePropertyListItem,
} from "@zilobase/features/databases";
import { getDatabasePropertyCellKind } from "../../../properties/lib/property-catalog";

/** Property editor body hosted inside the row actions submenu. */
export function DatabaseSelectionPropertyAction({
  mixed,
  onApply,
  onUpdateConfig,
  personOptions,
  property,
  value,
}: {
  mixed: boolean;
  onApply: (value: DatabasePropertyValue) => void;
  onUpdateConfig: (databasePropertyId: string, config: unknown) => Promise<unknown>;
  personOptions: Array<{ id: string; name: string; suffix?: string }>;
  property: DatabasePropertyListItem;
  value: DatabasePropertyValue;
}) {
  const [draftValue, setDraftValue] = useState(
    mixed ? "" : Array.isArray(value) ? (value[0] ?? "") : value,
  );
  const pageProperty = property.property;
  const cellKind = getDatabasePropertyCellKind(pageProperty.type);
  const scalarValue = Array.isArray(value) ? (value[0] ?? "") : value;

  if (cellKind === "select" || cellKind === "person") {
    return (
      <DatabasePropertySelect
        inline
        allowCreate={cellKind !== "person"}
        defaultOptions={
          pageProperty.type === "status"
            ? defaultStatusOptions
            : cellKind === "person"
              ? personOptions
              : undefined
        }
        label={pageProperty.name}
        multiple={
          pageProperty.type === "multi_select" ||
          (cellKind === "person" && getPersonLimit(pageProperty.config) !== "one_person")
        }
        onPropertyConfigChange={(config) => onUpdateConfig(property.id, config)}
        onSelect={onApply}
        propertyConfig={pageProperty.config}
        showStatusDot={pageProperty.type === "status"}
        value={
          pageProperty.type === "status" && !mixed
            ? getEffectiveStatusValue(value, pageProperty.config)
            : value
        }
        valueKey={cellKind === "person" ? "id" : "name"}
      />
    );
  }
  if (cellKind === "date") {
    return (
      <DatabasePropertyDate
        inline
        label={pageProperty.name}
        onPropertyConfigChange={(config) => onUpdateConfig(property.id, config)}
        onSelect={onApply}
        propertyConfig={pageProperty.config}
        value={value}
      />
    );
  }
  if (cellKind === "checkbox") {
    return (
      <div className="p-1">
        {[
          { icon: Check, label: "Checked", value: "true" },
          { icon: Minus, label: "Unchecked", value: "false" },
        ].map((option) => {
          const Icon = option.icon;
          return (
            <button
              className="database-selection-value-option"
              key={option.value}
              onClick={() => onApply(option.value)}
              type="button"
            >
              <Icon />
              <span>{option.label}</span>
              {!mixed && scalarValue === option.value ? <Check className="ml-auto" /> : null}
            </button>
          );
        })}
      </div>
    );
  }
  if (cellKind !== "input") return null;
  return (
    <form
      className="flex gap-2 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draftValue);
      }}
    >
      <Input
        aria-label={`${pageProperty.name} value for selected rows`}
        autoFocus
        onChange={(event) => setDraftValue(event.target.value)}
        placeholder={mixed ? "Replace mixed values" : "Enter a value"}
        type={pageProperty.type === "number" ? "number" : "text"}
        value={draftValue}
      />
      <button className="database-selection-apply" type="submit">
        Apply
      </button>
    </form>
  );
}
