import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PageEditorCommentsProvider } from "@/components/page-editor-comments"
import { PageEditorRegistryProvider } from "@/contexts/page-editor-registry"
import { WebFeaturesProvider } from "@/providers/features-provider"
import { queryClient } from "@/lib/query-client"

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <WebFeaturesProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <PageEditorRegistryProvider>
              <PageEditorCommentsProvider>{children}</PageEditorCommentsProvider>
            </PageEditorRegistryProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </WebFeaturesProvider>
    </QueryClientProvider>
  )
}
