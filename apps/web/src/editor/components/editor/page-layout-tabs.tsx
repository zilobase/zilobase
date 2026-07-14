import {
  ArrowUpRight,
  CalendarRange,
  ChartPie,
  FileText,
  Kanban,
  Table2,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LinkedDataSourcePicker } from "@/packages/editor/extensions/database/views/linked-data-source-picker"
import type {
  PageLayoutConfig,
  PageLayoutLinkedTab,
} from "@notelab/features/pages"

type PageLayoutTabsProps = {
  config: PageLayoutConfig
  onChange?: (config: PageLayoutConfig) => void
  onValueChange: (tabId: string) => void
  value: string
}

export function PageLayoutTabs({
  config,
  onChange,
  onValueChange,
  value,
}: PageLayoutTabsProps) {
  const addLinkedTab = (tab: PageLayoutLinkedTab) => {
    if (onChange && !config.linkedTabs.some((item) => item.id === tab.id)) {
      onChange({ ...config, linkedTabs: [...config.linkedTabs, tab] })
    }
    onValueChange(tab.id)
  }

  const removeActiveTab = () => {
    if (!onChange || value === "content") return
    onChange({
      ...config,
      linkedTabs: config.linkedTabs.filter((tab) => tab.id !== value),
    })
    onValueChange("content")
  }

  return (
    <div className="shrink-0 py-2">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        <Tabs className="min-w-0" onValueChange={onValueChange} value={value}>
          <TabsList
            className="min-w-0 justify-start overflow-x-auto"
            variant="tab"
          >
            <TabsTrigger className="h-8 shrink-0 grow-0 gap-2 px-3" value="content">
              <FileText />
              <span>Content</span>
            </TabsTrigger>
            {config.linkedTabs.map((tab) => {
              const ViewIcon =
                tab.viewType === "kanban"
                  ? Kanban
                  : tab.viewType === "timeline"
                    ? CalendarRange
                    : tab.viewType === "chart"
                      ? ChartPie
                      : Table2

              return (
                <TabsTrigger
                  className="h-8 shrink-0 grow-0 gap-2 px-3"
                  key={tab.id}
                  value={tab.id}
                >
                  <ViewIcon />
                  <span className="truncate">{tab.viewName}</span>
                  <ArrowUpRight className="size-3 text-muted-foreground" />
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
        {onChange ? (
          <>
            <LinkedDataSourcePicker menuFirst onSelect={addLinkedTab} />
            {value !== "content" ? (
              <Button
                aria-label="Remove linked data source tab"
                onClick={removeActiveTab}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
