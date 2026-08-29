import { ChevronRightIcon } from "@/shared/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/ui/collapsible";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/shared/ui/sidebar";
import { AiChatHistoryList } from "@/features/ai/components/elements/index";
import { useAiChatThreadState } from "@/features/ai/index";
import { useSidebarSectionOpen } from "../model/sidebar-section-open-state";

export function AiChatsSection({
  limit,
  storageKey,
}: {
  limit: number;
  storageKey: string;
}) {
  const { activeThreadId, setActiveThreadId } = useAiChatThreadState();
  const [open, setOpen] = useSidebarSectionOpen(storageKey);

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible min-h-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel asChild className="hover:bg-accent hover:text-accent-foreground">
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>AI chats</span>
              <ChevronRightIcon className="ml-1 size-3 text-muted-foreground transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <AiChatHistoryList
              activeThreadId={activeThreadId}
              className="px-0 py-0"
              limit={limit}
              onSelectThread={setActiveThreadId}
            />
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
