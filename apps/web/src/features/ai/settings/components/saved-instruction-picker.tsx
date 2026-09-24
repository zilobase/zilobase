import * as React from "react";
import { usePageNavigation } from "@zilobase/features/pages/react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { Button } from "@/shared/ui/button";
import { ChevronDownIcon } from "@/shared/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export function SavedInstructionPicker({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (page: { id: string }) => void;
}) {
  const workspaceId = useActiveWorkspaceId();
  const navigation = usePageNavigation(workspaceId);
  const [open, setOpen] = React.useState(false);
  const pages = (navigation.data?.pages ?? []).filter(
    (page) => page.metadata?.zilobaseai === "instruction",
  );
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void navigation.refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled} className="w-fit gap-2" variant="ghost" size="sm">
          Use saved instruction
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {pages.length ? (
          pages.map((page) => (
            <DropdownMenuItem key={page.id} onSelect={() => onSelect({ id: page.id })}>
              {page.name || "Untitled"}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>
            {navigation.isLoading
              ? "Loading instructions…"
              : navigation.isError
                ? "Could not load instructions."
                : "No saved instructions found."}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
