import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceAiModels } from "@zilobase/features/ai-chat/react";
import { fallbackModels } from "./model/chat-runtime-model";

export function useConversationModel() {
  const [model, setModel] = useState<string>("auto");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const aiModelsQuery = useWorkspaceAiModels();
  const models = useMemo(() => {
    const queryModels = aiModelsQuery.data?.models ?? [];

    return queryModels.length ? queryModels : fallbackModels;
  }, [aiModelsQuery.data?.models]);
  const selectedModelData = useMemo(() => models.find((m) => m.id === model), [models, model]);
  const chefs = useMemo(() => Array.from(new Set(models.map((item) => item.chef))), [models]);

  useEffect(() => {
    setModel((current) => (models.some((item) => item.id === current) ? current : models[0].id));
  }, [models]);

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setModel(modelId);
      setModelSelectorOpen(false);
    },
    [setModel, setModelSelectorOpen],
  );

  return {
    model,
    modelSelectorOpen,
    setModelSelectorOpen,
    models,
    selectedModelData,
    chefs,
    handleModelSelect,
  };
}
