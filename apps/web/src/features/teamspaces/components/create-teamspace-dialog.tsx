import { getTeamspaceCreationInput } from "../model/teamspace-creation";
import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/shared/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

import { Label } from "@/shared/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { Spinner } from "@/shared/ui/spinner";

import { Textarea } from "@/shared/ui/textarea";

import { getApiErrorMessage } from "@/platform/network/api";

import { type TeamspaceAccessMode } from "@zilobase/features/teamspaces";
import { useCreateTeamspace } from "@zilobase/features/teamspaces/react";

export function CreateTeamspaceDialog({
  open,
  onOpenChange,
  workspaceId,
  idPrefix = "teamspace",
}: {
  open: boolean;
  idPrefix?: string;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null | undefined;
}) {
  const create = useCreateTeamspace();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState<TeamspaceAccessMode>("closed");

  const submit = () => {
    const input = getTeamspaceCreationInput({
      accessMode,
      description,
      name,
      workspaceId,
    });
    if (!input) return;
    create.mutate(input, {
      onError: (error) => toast.error(getApiErrorMessage(error)),
      onSuccess: () => {
        toast.success("Teamspace created.");
        setName("");
        setDescription("");
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New teamspace</DialogTitle>
          <DialogDescription>Create a dedicated home for a team or project.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-name`}>Name</Label>
            <Input
              id={`${idPrefix}-name`}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-description`}>Description</Label>
            <Textarea
              id={`${idPrefix}-description`}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </div>
          <div className="grid gap-2">
            <Label>Access</Label>
            <Select
              onValueChange={(value) => setAccessMode(value as TeamspaceAccessMode)}
              value={accessMode}
            >
              <SelectTrigger aria-label="Teamspace access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open — anyone can join</SelectItem>
                <SelectItem value="closed">Closed — members join by invite</SelectItem>
                <SelectItem value="private">Private — visible only to members</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!name.trim() || create.isPending} onClick={submit}>
            {create.isPending ? <Spinner /> : null}Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
