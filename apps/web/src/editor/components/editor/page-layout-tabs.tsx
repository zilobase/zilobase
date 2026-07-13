import { Trash2 } from "lucide-react"

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
    <div className="sticky top-0 z-10 shrink-0 border-b bg-background/95 px-5 pt-2 backdrop-blur md:px-20 lg:px-24">
      <div className="flex items-center">
        <Tabs onValueChange={onValueChange} value={value}>
          <TabsList className="h-9 bg-transparent p-0">
            <TabsTrigger value="content">Content</TabsTrigger>
            {config.linkedTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.viewName}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {onChange ? (
          <>
            <LinkedDataSourcePicker onSelect={addLinkedTab} />
            {value !== "content" ? (
              <Button
                aria-label="Remove linked data source tab"
                className="ml-auto"
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
