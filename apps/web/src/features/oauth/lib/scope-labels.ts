const scopeLabels: Record<string, { description: string; title: string }> = {
  openid: {
    title: "Sign you in",
    description: "Confirm your Zilobase account identity.",
  },
  profile: {
    title: "View your profile",
    description: "See your name and profile photo.",
  },
  email: {
    title: "View your email",
    description: "See the email address on your account.",
  },
  offline_access: {
    title: "Stay connected",
    description: "Refresh access without asking you each time.",
  },
  "workspaces.read": {
    title: "See your workspaces",
    description: "List workspaces you belong to.",
  },
  "pages.read": {
    title: "Read pages",
    description: "View pages you already have access to.",
  },
  "pages.write": {
    title: "Edit pages",
    description: "Create and update pages in the selected workspace.",
  },
  "clips.write": {
    title: "Save clips",
    description: "Save web clippings as pages.",
  },
  "databases.read": {
    title: "Read databases",
    description: "View databases you already have access to.",
  },
  "databases.write": {
    title: "Edit databases",
    description: "Create rows and update database properties.",
  },
  "search.read": {
    title: "Search",
    description: "Search pages and databases in the workspace.",
  },
};

export function parseRequestedScopes(scope: string | null | undefined) {
  if (!scope) {
    return [];
  }

  return scope
    .split(/[+\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function labelForScope(scope: string) {
  return (
    scopeLabels[scope] ?? {
      title: scope,
      description: "Access this capability on your account.",
    }
  );
}
