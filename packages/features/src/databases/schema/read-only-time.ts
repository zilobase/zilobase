export type ReadOnlyTimePropertySource = {
  createdAt: string;
  page: {
    createdAt?: string;
    updatedAt?: string;
  };
  updatedAt: string;
};

export const isReadOnlyTimeProperty = (type: string) =>
  type === "created_time" || type === "edited_time";

export const getReadOnlyTimePropertyRawValue = (
  source: ReadOnlyTimePropertySource,
  type: string,
) =>
  type === "created_time"
    ? (source.page.createdAt ?? source.createdAt)
    : (source.page.updatedAt ?? source.updatedAt);
