export type DatabaseFormQuestionSettings = {
  description: string
  descriptionEnabled: boolean
  label: string
  longAnswer: boolean
  required: boolean
  syncWithPropertyName: boolean
}

export type DatabaseFormQuestionSettingsPatch = Partial<
  DatabaseFormQuestionSettings
>

export type DatabaseFormQuestionMove = "bottom" | "down" | "top" | "up"

export function getDatabaseFormQuestionSettings(
  config: unknown,
  propertyId: string,
  propertyName: string,
): DatabaseFormQuestionSettings {
  const settings = getDatabaseFormQuestionSettingsById(config)[propertyId]

  return {
    description:
      typeof settings?.description === "string" ? settings.description : "",
    descriptionEnabled: settings?.descriptionEnabled === true,
    label:
      settings?.syncWithPropertyName === false &&
      typeof settings.label === "string" &&
      settings.label.trim()
        ? settings.label
        : propertyName,
    longAnswer: settings?.longAnswer === true,
    required: settings?.required === true,
    syncWithPropertyName: settings?.syncWithPropertyName !== false,
  }
}

export function getDatabaseFormQuestionSettingsById(
  config: unknown,
): Record<string, DatabaseFormQuestionSettingsPatch> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {}

  const formQuestions = (config as { formQuestions?: unknown }).formQuestions

  if (
    !formQuestions ||
    typeof formQuestions !== "object" ||
    Array.isArray(formQuestions)
  ) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(formQuestions).filter(
      ([, settings]) =>
        settings && typeof settings === "object" && !Array.isArray(settings),
    ),
  ) as Record<string, DatabaseFormQuestionSettingsPatch>
}

export function moveDatabaseFormQuestion(
  questionIds: string[],
  questionId: string,
  destination: DatabaseFormQuestionMove,
) {
  const currentIndex = questionIds.indexOf(questionId)

  if (currentIndex < 0 || questionIds.length < 2) return questionIds

  const nextIndex =
    destination === "top"
      ? 0
      : destination === "bottom"
        ? questionIds.length - 1
        : destination === "up"
          ? Math.max(0, currentIndex - 1)
          : Math.min(questionIds.length - 1, currentIndex + 1)

  if (nextIndex === currentIndex) return questionIds

  const nextQuestionIds = [...questionIds]
  nextQuestionIds.splice(currentIndex, 1)
  nextQuestionIds.splice(nextIndex, 0, questionId)
  return nextQuestionIds
}
