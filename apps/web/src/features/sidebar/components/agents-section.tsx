import { useNavigate } from "@tanstack/react-router";
import { useAiAgentProfiles, useCreateAiAgentProfile } from "@zilobase/features/ai-chat/react";
import { toast } from "sonner";

import { BotIcon, ChevronRightIcon, PlusIcon } from "@/shared/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state";

export function AgentsSection({ activeAgentId }: { activeAgentId: string | null }) {
  const navigate = useNavigate();
  const agents = useAiAgentProfiles();
  const createAgent = useCreateAiAgentProfile();
  const [open, setOpen] = useSidebarSectionOpen("zilobase:sidebar:agents");

  const createCustomAgent = async () => {
    if (createAgent.isPending) return;

    try {
      const payload = await createAgent.mutateAsync({ name: "Untitled agent" });
      await navigate({ params: { agentId: payload.agent.id }, to: "/agents/$agentId" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create agent.");
    }
  };

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible min-h-0">
        <div className="group/section-header relative">
          <CollapsibleTrigger asChild>
            <SidebarGroupLabel
              asChild
              className="pr-9 group-hover/section-header:bg-action-neutral-hover group-hover/section-header:text-action-on-neutral"
            >
              <button className="group/section-label w-full cursor-pointer" type="button">
                <span>Agents</span>
                <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
              </button>
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <SidebarGroupAction
            aria-label="Create agent"
            className="right-2 transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100"
            disabled={createAgent.isPending}
            onClick={() => void createCustomAgent()}
            title="Create agent"
            type="button"
          >
            <PlusIcon />
          </SidebarGroupAction>
        </div>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <SidebarMenu>
              {(agents.data ?? []).map((agent) => (
                <SidebarMenuItem key={agent.id}>
                  <SidebarMenuButton
                    isActive={activeAgentId === agent.id}
                    onClick={() =>
                      void navigate({ params: { agentId: agent.id }, to: "/agents/$agentId" })
                    }
                    title={agent.name}
                    type="button"
                  >
                    <BotIcon />
                    <span className="truncate">{agent.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
