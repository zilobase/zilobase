import { Bell, CircleUserRound, Hash, UserRound } from "@/shared/components/icons";
import type { ReactNode } from "react";

import type { DatabasePropertyConfig } from "../../../views/model/database-view-config";
import { PropertySettingSubmenu } from "../shared";

type PersonDefaultValue = "no_default" | "created_by";
type PersonLimitValue = "one_person" | "no_limit";
type PersonNotificationsValue = "users_and_groups" | "users_only" | "none";

const personLimitOptions = [
  { label: "1 Person", value: "one_person" },
  { label: "No limit", value: "no_limit" },
] satisfies { label: string; value: PersonLimitValue }[];

const personDefaultOptions = [
  { label: "No default", value: "no_default" },
  { icon: <UserRound />, label: "Created by", value: "created_by" },
] satisfies { icon?: ReactNode; label: string; value: PersonDefaultValue }[];

const personNotificationsOptions = [
  { label: "Users and groups", value: "users_and_groups" },
  { label: "Users only", value: "users_only" },
  { label: "None", value: "none" },
] satisfies { label: string; value: PersonNotificationsValue }[];

export function PersonPropertySettings({
  config,
  onUpdateConfig,
}: {
  config: Required<
    Pick<
      DatabasePropertyConfig,
      "personDefault" | "personLimit" | "personNotifications"
    >
  >;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
}) {
  return (
    <>
      <PropertySettingSubmenu
        icon={<Hash />}
        label="Limit"
        onSelect={(personLimit) => onUpdateConfig({ personLimit })}
        options={personLimitOptions}
        selectedValue={config.personLimit}
      />
      <PropertySettingSubmenu
        icon={<CircleUserRound />}
        label="Default"
        onSelect={(personDefault) => onUpdateConfig({ personDefault })}
        options={personDefaultOptions}
        selectedValue={config.personDefault}
      />
      <PropertySettingSubmenu
        icon={<Bell />}
        label="Notifications"
        onSelect={(personNotifications) =>
          onUpdateConfig({ personNotifications })
        }
        options={personNotificationsOptions}
        selectedValue={config.personNotifications}
      />
    </>
  );
}

export function getPersonPropertyConfig(config: unknown) {
  const parsedConfig =
    config && typeof config === "object"
      ? (config as DatabasePropertyConfig)
      : {};

  return {
    personDefault: isPersonDefaultValue(parsedConfig.personDefault)
      ? parsedConfig.personDefault
      : "no_default",
    personLimit: isPersonLimitValue(parsedConfig.personLimit)
      ? parsedConfig.personLimit
      : "no_limit",
    personNotifications: isPersonNotificationsValue(
      parsedConfig.personNotifications,
    )
      ? parsedConfig.personNotifications
      : "users_only",
  };
}

function isPersonLimitValue(value: unknown): value is PersonLimitValue {
  return value === "one_person" || value === "no_limit";
}

function isPersonDefaultValue(value: unknown): value is PersonDefaultValue {
  return value === "no_default" || value === "created_by";
}

function isPersonNotificationsValue(
  value: unknown,
): value is PersonNotificationsValue {
  return (
    value === "users_and_groups" || value === "users_only" || value === "none"
  );
}
