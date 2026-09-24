import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from "@/shared/ui/item";

import { Skeleton } from "@/shared/ui/skeleton";

export function RowsSkeleton() {
  return (
    <ItemGroup className="gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <Item className="min-h-12" key={index} variant="outline">
          <ItemMedia>
            <Skeleton className="size-8 rounded-lg" />
          </ItemMedia>
          <ItemContent>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </ItemContent>
          <ItemActions>
            <Skeleton className="h-5 w-16 rounded-4xl" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
