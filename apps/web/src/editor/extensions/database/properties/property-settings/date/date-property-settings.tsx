import { Calendar } from "@/components/icons";

import {
  dateFormatOptions,
  timeFormatOptions,
  type DateFormatValue,
  type TimeFormatValue,
} from "../../database-date-config";
import type { DatabasePropertyConfig } from "../../../views/database-view-config";
import { PropertySettingSubmenu } from "../shared";

export function DatePropertySettings({
  dateFormat,
  onUpdateConfig,
  timeFormat,
}: {
  dateFormat: DateFormatValue;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  timeFormat: TimeFormatValue;
}) {
  return (
    <>
      <PropertySettingSubmenu
        icon={<Calendar />}
        label="Date format"
        onSelect={(nextDateFormat) =>
          onUpdateConfig({ dateFormat: nextDateFormat })
        }
        options={dateFormatOptions}
        selectedValue={dateFormat}
      />
      <PropertySettingSubmenu
        icon={<Calendar />}
        label="Time format"
        onSelect={(nextTimeFormat) =>
          onUpdateConfig({ timeFormat: nextTimeFormat })
        }
        options={timeFormatOptions}
        selectedValue={timeFormat}
      />
    </>
  );
}
