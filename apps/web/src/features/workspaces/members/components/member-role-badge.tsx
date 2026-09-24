import { Badge } from "@/shared/ui/badge";

import { capitalize } from "../model/member-presentation";

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "admin" || role === "owner" ? "default" : "outline"}>
      {capitalize(role)}
    </Badge>
  );
}
