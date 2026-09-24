export type AppSearchResult = {
  emoji: string | null;
  id: string;
  path: string;
  title: string;
  type: "database" | "page";
};

export type AppSearchResultType = AppSearchResult["type"];
