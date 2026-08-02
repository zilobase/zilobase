import { Check, Hash } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { colorTokens, getColorTokenValue } from "@/lib/color-tokens";

import {
  getNumberDecimalPlaces,
  getNumberDisplayColor,
  getNumberDisplayDivideBy,
  getNumberDisplayShowNumber,
  getNumberDisplayStyle,
  getNumberFormat,
  type DatabaseNumberDisplayStyle,
  type DatabasePropertyConfig,
  type NumberDecimalPlacesValue,
} from "../../../views/database-view-config";
import { PropertySettingSubmenu } from "../shared";

type NumberPropertyConfig = {
  numberDecimalPlaces: NumberDecimalPlacesValue;
  numberDisplayColor: string;
  numberDisplayDivideBy: number;
  numberDisplayShowNumber: boolean;
  numberDisplayStyle: DatabaseNumberDisplayStyle;
  numberFormat: string;
};

export function NumberPropertySettings({
  config,
  onUpdateConfig,
}: {
  config: NumberPropertyConfig;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
}) {
  const showVisualOptions = config.numberDisplayStyle !== "number";

  return (
    <div className="space-y-1">
      <NumberFormatSettingSubmenu
        onSelect={(numberFormat) => onUpdateConfig({ numberFormat })}
        selectedValue={config.numberFormat}
      />
      <PropertySettingSubmenu
        icon={<Hash />}
        label="Decimal places"
        onSelect={(numberDecimalPlaces) =>
          onUpdateConfig({ numberDecimalPlaces })
        }
        options={numberDecimalPlacesOptions}
        selectedValue={config.numberDecimalPlaces}
      />
      <DropDrawerSeparator />
      <DropDrawerLabel>Show as</DropDrawerLabel>
      <div className="grid grid-cols-3 gap-2 px-1.5 pb-1">
        {numberDisplayStyleOptions.map((option) => {
          const isSelected = option.value === config.numberDisplayStyle;

          return (
            <button
              aria-pressed={isSelected}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                isSelected
                  ? "border-primary bg-accent text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              key={option.value}
              onClick={() =>
                onUpdateConfig({ numberDisplayStyle: option.value })
              }
              type="button"
            >
              <option.preview />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {showVisualOptions ? (
        <div className="space-y-3 rounded-md border border-border/80 bg-muted/30 px-3 py-3">
          <PropertySettingSubmenu
            icon={
              <span
                aria-hidden="true"
                className={`size-4 rounded-sm border border-foreground/10 ${getColorSwatchClassName(config.numberDisplayColor)}`}
              />
            }
            label="Color"
            onSelect={(numberDisplayColor) =>
              onUpdateConfig({ numberDisplayColor })
            }
            options={numberColorOptions}
            selectedValue={getColorTokenValue(config.numberDisplayColor)}
          />
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">
              Divide by
            </label>
            <Input
              defaultValue={String(config.numberDisplayDivideBy)}
              inputMode="decimal"
              onBlur={(event) => {
                const nextValue = Number(event.target.value);

                if (Number.isFinite(nextValue) && nextValue > 0) {
                  onUpdateConfig({ numberDisplayDivideBy: nextValue });
                } else {
                  event.target.value = String(config.numberDisplayDivideBy);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <DropDrawerItem
            aria-pressed={config.numberDisplayShowNumber}
            className="rounded-md border border-transparent px-0 hover:bg-transparent focus:bg-transparent"
            onSelect={(event) => {
              event.preventDefault();
              onUpdateConfig({
                numberDisplayShowNumber: !config.numberDisplayShowNumber,
              });
            }}
          >
            <span>Show number</span>
            <Switch
              checked={config.numberDisplayShowNumber}
              className="ml-auto pointer-events-none"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        </div>
      ) : null}
    </div>
  );
}

export function getNumberPropertyConfig(config: unknown): NumberPropertyConfig {
  return {
    numberDecimalPlaces: getNumberDecimalPlaces(config),
    numberDisplayColor: getNumberDisplayColor(config),
    numberDisplayDivideBy: getNumberDisplayDivideBy(config),
    numberDisplayShowNumber: getNumberDisplayShowNumber(config),
    numberDisplayStyle: getNumberDisplayStyle(config),
    numberFormat: getNumberFormat(config),
  };
}

function NumberFormatSettingSubmenu({
  onSelect,
  selectedValue,
}: {
  onSelect: (value: string) => void;
  selectedValue: string;
}) {
  const [query, setQuery] = useState("");
  const filteredOptions = numberFormatOptions.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedOption =
    numberFormatOptions.find((option) => option.value === selectedValue) ??
    numberFormatOptions[0];

  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger>
        <Hash />
        <span className="flex-1">Number format</span>
        <span className="text-muted-foreground">{selectedOption?.label}</span>
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-72">
        <div className="px-1.5 py-1">
          <Input
            aria-label="Filter number formats"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter formats..."
            value={query}
          />
        </div>
        {filteredOptions.map((option) => (
          <DropDrawerItem
            key={option.value}
            onSelect={(event) => {
              event.preventDefault();
              onSelect(option.value);
            }}
          >
            <span>{option.label}</span>
            {option.value === selectedValue ? (
              <Check className="ml-auto" />
            ) : null}
          </DropDrawerItem>
        ))}
        {filteredOptions.length === 0 ? (
          <DropDrawerItem disabled>No matching formats</DropDrawerItem>
        ) : null}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}

const numberFormatOptions = [
  { label: "Number", value: "number" },
  { label: "Number with separators", value: "number_with_separators" },
  { label: "Percent", value: "percent" },
  { label: "US Dollar (USD)", value: "usd" },
  { label: "Australian dollar (AUD)", value: "aud" },
  { label: "Canadian dollar (CAD)", value: "cad" },
  { label: "Singapore dollar (SGD)", value: "sgd" },
  { label: "Euro (EUR)", value: "eur" },
  { label: "Pound (GBP)", value: "gbp" },
  { label: "Yen (JPY)", value: "jpy" },
  { label: "Ruble (RUB)", value: "rub" },
  { label: "Rupee (INR)", value: "inr" },
  { label: "Won (KRW)", value: "krw" },
  { label: "Yuan (CNY)", value: "cny" },
  { label: "Real (BRL)", value: "brl" },
  { label: "Lira (TRY)", value: "try" },
  { label: "Rupiah (IDR)", value: "idr" },
  { label: "Franc (CHF)", value: "chf" },
  { label: "Hong Kong dollar (HKD)", value: "hkd" },
  { label: "New Zealand dollar (NZD)", value: "nzd" },
  { label: "Swedish krona (SEK)", value: "sek" },
  { label: "Norwegian krone (NOK)", value: "nok" },
  { label: "Mexican peso (MXN)", value: "mxn" },
  { label: "Rand (ZAR)", value: "zar" },
  { label: "New Taiwan dollar (TWD)", value: "twd" },
  { label: "Danish krone (DKK)", value: "dkk" },
  { label: "Polish zloty (PLN)", value: "pln" },
  { label: "Thai baht (THB)", value: "thb" },
  { label: "UAE dirham (AED)", value: "aed" },
  { label: "Argentine peso (ARS)", value: "ars" },
  { label: "Chilean peso (CLP)", value: "clp" },
  { label: "Colombian peso (COP)", value: "cop" },
  { label: "Saudi riyal (SAR)", value: "sar" },
] satisfies { label: string; value: string }[];

const numberDecimalPlacesOptions = [
  { label: "Default", value: "default" },
  { label: "0", value: 0 },
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "4", value: 4 },
  { label: "5", value: 5 },
] satisfies { label: string; value: NumberDecimalPlacesValue }[];

const numberColorOptions = colorTokens.map((color) => ({
  icon: (
    <span
      aria-hidden="true"
      className={`size-4 rounded-sm border border-foreground/10 ${color.backgroundClass}`}
    />
  ),
  label: color.name,
  value: color.value ?? "default",
}));

const numberDisplayStyleOptions = [
  { label: "Number", preview: NumberDisplayPreview, value: "number" },
  { label: "Bar", preview: BarDisplayPreview, value: "bar" },
  { label: "Ring", preview: RingDisplayPreview, value: "ring" },
] satisfies {
  label: string;
  preview: () => ReactNode;
  value: DatabaseNumberDisplayStyle;
}[];

function NumberDisplayPreview() {
  return (
    <span className="text-2xl font-semibold leading-none text-primary">42</span>
  );
}

function BarDisplayPreview() {
  return (
    <span className="flex h-3 w-16 items-center rounded-full bg-muted">
      <span className="h-2 w-9 rounded-full bg-primary" />
    </span>
  );
}

function RingDisplayPreview() {
  return (
    <svg aria-hidden="true" className="size-8 text-primary" viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        fill="none"
        r="8"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <circle
        cx="12"
        cy="12"
        fill="none"
        r="8"
        stroke="currentColor"
        strokeDasharray="50.24"
        strokeDashoffset="12.56"
        strokeLinecap="round"
        strokeWidth="3"
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

function getColorSwatchClassName(color?: string | null) {
  const resolvedColor = getColorTokenValue(color);

  return (
    colorTokens.find((token) => (token.value ?? "default") === resolvedColor)
      ?.backgroundClass ??
    colorTokens[0]?.backgroundClass ??
    "bg-background"
  );
}
