import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { createLibraryItem, type CreateLibraryItemInput } from "./operations";

export function useCreateLibraryItem() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: CreateLibraryItemInput) => createLibraryItem(context, input),
  });
}
