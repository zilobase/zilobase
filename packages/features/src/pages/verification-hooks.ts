import { useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  changeContentVerification,
  contentVerificationQueryOptions,
  reconcileContentVerification,
  type VerificationChange,
  type VerificationResource,
} from "./verification";
export function useContentVerification(resource: VerificationResource | null, enabled = true) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(contentVerificationQueryOptions(apiFetch, resource, enabled));
}
export function useUpdateContentVerification(resource: VerificationResource | null) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: (change: VerificationChange) => {
      if (!resource) throw new Error("Content is required");
      return changeContentVerification(queryClient, apiFetch, resource, change);
    },
    onSuccess: (result) => reconcileContentVerification(queryClient, result),
  });
}
