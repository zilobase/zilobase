import { useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"

import {
  isAgentLiveEffect,
  type AgentLiveEffect,
} from "@zilobase/features/ai-chat"
import {
  databaseQueryKey,
  type DatabasePayload,
} from "@zilobase/features/databases"
import {
  applyNavDelta,
  applyNavigationDeltaToCache,
  pageQueryKey,
  type PageDetail,
} from "@zilobase/features/pages"
import { insertDatabaseBlockInContent } from "@zilobase/page-context"

import {
  usePageEditorRegistry,
  usePageEditorRegistryVersion,
} from "@/features/editor/runtime/page-editor-registry"

type AgentDataPart = {
  data: unknown
  type: string
}

export function useAgentLiveEffects() {
  const queryClient = useQueryClient()
  const { getEditorHandle } = usePageEditorRegistry()
  const registryVersion = usePageEditorRegistryVersion()
  const handledEffectIds = useRef(new Set<string>())
  const pendingEmbeds = useRef(new Map<string, Extract<
    AgentLiveEffect,
    { kind: "page-embed" }
  >>())

  const applyEmbed = useCallback((effect: Extract<
    AgentLiveEffect,
    { kind: "page-embed" }
  >) => {
    const handle = getEditorHandle(effect.pageId)
    if (!handle?.isEditable()) return false

    try {
      const currentContent = handle.getContentJson()
      const { alreadyEmbedded, content, titleUpdated } =
        insertDatabaseBlockInContent(currentContent, {
          afterHeading: effect.afterHeading,
          databaseId: effect.databaseId,
          showTitle: effect.showTitle,
        })

      return (alreadyEmbedded && !titleUpdated) || handle.setContentJson(content)
    } catch (error) {
      console.warn("Failed to apply live AI database embed", error)
      return false
    }
  }, [getEditorHandle])

  useEffect(() => {
    for (const [effectId, effect] of pendingEmbeds.current) {
      if (!applyEmbed(effect)) continue
      pendingEmbeds.current.delete(effectId)
      handledEffectIds.current.add(effectId)
    }
  }, [applyEmbed, registryVersion])

  return useCallback((part: AgentDataPart) => {
    if (part.type !== "data-agent-effect" || !isAgentLiveEffect(part.data)) {
      return
    }
    const effect = part.data
    if (handledEffectIds.current.has(effect.effectId)) return

    if (effect.kind === "database-seed") {
      queryClient.setQueryData<DatabasePayload>(
        databaseQueryKey(effect.databaseId),
        effect.payload as DatabasePayload,
      )
      handledEffectIds.current.add(effect.effectId)
      return
    }

    if (effect.kind === "page-upsert") {
      queryClient.setQueryData<PageDetail>(
        pageQueryKey(effect.pageId),
        effect.detail as PageDetail,
      )
      handledEffectIds.current.add(effect.effectId)
      return
    }

    if (effect.kind === "nav-delta") {
      applyNavigationDeltaToCache(
        queryClient,
        effect.workspaceId,
        effect.delta as Parameters<typeof applyNavDelta>[1],
      )
      handledEffectIds.current.add(effect.effectId)
      return
    }

    pendingEmbeds.current.set(effect.effectId, effect)
    if (applyEmbed(effect)) {
      pendingEmbeds.current.delete(effect.effectId)
      handledEffectIds.current.add(effect.effectId)
    }
  }, [applyEmbed, queryClient])
}
