import { useState } from "react";
import { ChatbotMessages } from "@/sections/ai/chat/components/chatbot-messages";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { AgentActivity } from "@/sections/ai/chat/lib/agent-activity";
import { Button } from "@/components/ui/button";
import type { ChatReadProgress, ChatToolActivity } from "@zilobase/features/ai";

export function AiActivityMessageFixture() {
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [stopped, setStopped] = useState(false);
  const [compaction, setCompaction] = useState<ChatReadProgress["compaction"]>();
  const [toolActivities, setToolActivities] = useState<ChatToolActivity[]>([]);
  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setStreaming(false);
            setToolActivities([
              {
                id: "semantic",
                name: "semantic_search_workspace",
                label: "Searching workspace by meaning",
                status: "completed",
                returned: 0,
                query: "refund replies",
                searchMetadata: {
                  mode: "semantic",
                  indexAvailability: "disabled",
                  degradationReason: "workspace_disabled",
                },
              },
            ]);
          }}
        >
          Unavailable semantic search
        </Button>
        <Button
          onClick={() => {
            setStreaming(true);
            setCompaction({ status: "running", count: 1, summarizedMessages: 0 });
          }}
        >
          Start compaction
        </Button>
        <Button
          onClick={() => {
            setCompaction({ status: "completed", count: 1, summarizedMessages: 24 });
            setText("The earlier decision is preserved.");
            setStreaming(false);
          }}
        >
          Complete compaction
        </Button>
        <Button
          onClick={() => {
            setCompaction({ status: "failed", count: 1, summarizedMessages: 0 });
            setStreaming(false);
          }}
        >
          Fail compaction
        </Button>
        <Button
          onClick={() =>
            setActivities([
              {
                id: "read",
                type: "task",
                title: "Reading selected pages",
                status: "running",
                steps: [{ id: "load", title: "Load page content", status: "running" }],
              },
            ])
          }
        >
          Emit activity
        </Button>
        <Button
          onClick={() =>
            setActivities((current) =>
              current.map((activity) =>
                activity.type === "task"
                  ? {
                      ...activity,
                      status: "completed",
                      steps: activity.steps.map((step) => ({ ...step, status: "completed" })),
                    }
                  : activity,
              ),
            )
          }
        >
          Complete activity
        </Button>
        <Button onClick={() => setText((current) => current + "Streamed answer. ")}>
          Stream answer
        </Button>
        <Button
          onClick={() =>
            setText((current) => current + "👩🏽‍💻 Cafe\u0301 日本語 smooth streaming. ".repeat(30))
          }
        >
          Stream burst
        </Button>
        <Button onClick={() => setText("Corrected server snapshot.")}>Replace answer</Button>
        <Button onClick={() => setText("")}>Reset answer</Button>
        <Button onClick={() => setStreaming(false)}>Finish answer</Button>
        <Button
          onClick={() => {
            setStopped(true);
            setStreaming(false);
          }}
        >
          Stop answer
        </Button>
      </div>
      <output aria-label="Received response" className="sr-only">
        {text}
      </output>
      <div className="h-[500px]">
        <MessageScrollerProvider>
          <MessageScroller>
            <MessageScrollerViewport>
              <ChatbotMessages
                isSidebar
                messages={[
                  { id: "user", role: "user", text: "Read the selected page" },
                  {
                    id: "assistant",
                    role: "assistant",
                    text,
                    ...(compaction || toolActivities.length
                      ? { progress: { activities: toolActivities, canContinue: false, compaction } }
                      : {}),
                    status: streaming ? "streaming" : stopped ? "stopped" : "completed",
                  },
                ]}
                streaming={streaming}
                activityByMessage={
                  compaction || toolActivities.length ? undefined : { assistant: activities }
                }
              />
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
    </div>
  );
}
