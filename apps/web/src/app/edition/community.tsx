import type { ComponentType } from "react";

export type EditionLoginMethodProps = {
  disabled: boolean;
};

export type EditionWebModule = {
  additionalLoginMethods: readonly ComponentType<EditionLoginMethodProps>[];
  components: Readonly<Record<string, ComponentType>>;
  navigation: readonly {
    icon?: ComponentType<{ className?: string }>;
    id: string;
    title: string;
    url: string;
  }[];
  routes: readonly {
    component: ComponentType;
    id: string;
    path: string;
  }[];
  settingsSections: readonly {
    component: ComponentType;
    icon?: ComponentType<{ className?: string }>;
    id: string;
    title: string;
  }[];
};

export const editionWebModule: EditionWebModule = {
  additionalLoginMethods: [],
  components: {},
  navigation: [],
  routes: [],
  settingsSections: [],
};
