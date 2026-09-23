import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { databaseColumnMinWidth } from "../../model/column-dimensions";
import { useResizableTableColumns } from "@/shared/hooks/use-resizable-table-columns";

import { getDatabasePropertyOrder } from "../../model/database-view-config";

import {
  DATABASE_NAME_COLUMN_ID,
  areColumnOrdersEqual,
  getColumnIdsWithInsertedProperty,
  getColumnWidth,
  getHeaderEditingKey,
  getInsertPropertyColumnKey,
  getMergedColumnIds,
  getPropertyKeyFromHeaderEditingKey,
  type PendingFormulaSetup,
  type PendingInsertProperty,
  type PendingPropertyInsertOrder,
} from "../model/database-table-model";
import { getTableColumnKeys } from "../model/database-table-model";

import type { RefObject } from "react"
import type { DatabaseProperty } from "@zilobase/features/databases"

export function useTableColumns({
  editable,
  canEditStructure,
  databaseConfig,
  renderedProperties,
  properties,
  tableWrapRef,
  saveDatabasePropertyOrder,
  addDatabaseProperty,
}: {
  editable: boolean
  canEditStructure: boolean
  databaseConfig: unknown
  renderedProperties: DatabaseProperty[]
  properties: DatabaseProperty[]
  tableWrapRef: RefObject<HTMLDivElement | null>
  saveDatabasePropertyOrder: (ids: string[]) => void
  addDatabaseProperty: (type?: string, label?: string, position?: number) => void
}) {
  const [pendingInsertProperty, setPendingInsertProperty] =
    useState<PendingInsertProperty | null>(null)
  const [pendingPropertyInsertOrder, setPendingPropertyInsertOrder] =
    useState<PendingPropertyInsertOrder | null>(null)
  const [pendingFormulaSetup, setPendingFormulaSetup] =
    useState<PendingFormulaSetup | null>(null)
  const [formulaSetupPropertyId, setFormulaSetupPropertyId] = useState<
    string | null
  >(null)
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
  const [dragColumnOrder, setDragColumnOrder] = useState<string[] | null>(null)
  const dragColumnOrderRef = useRef<string[] | null>(null)
  const [pendingColumnOrder, setPendingColumnOrder] = useState<string[] | null>(
    null
  )
  const suppressPropertyHeaderClickRef = useRef(false)
  const [editingPropertyKey, setEditingPropertyKey] = useState<string | null>(
    null
  )
  const activeEditingPropertyKey =
    getPropertyKeyFromHeaderEditingKey(editingPropertyKey)
  const propertiesById = useMemo(
    () =>
      new Map(renderedProperties.map((property) => [property.id, property])),
    [renderedProperties]
  )
  const baseColumnIds = useMemo(
    () => [
      DATABASE_NAME_COLUMN_ID,
      ...renderedProperties.map((property) => property.id),
    ],
    [renderedProperties]
  )
  const savedColumnIds = useMemo(() => {
    const configuredColumnOrder = getDatabasePropertyOrder(databaseConfig)

    return configuredColumnOrder.includes(DATABASE_NAME_COLUMN_ID)
      ? getMergedColumnIds(baseColumnIds, configuredColumnOrder)
      : baseColumnIds
  }, [baseColumnIds, databaseConfig])
  const renderedColumnIds = useMemo(
    () =>
      pendingColumnOrder
        ? getMergedColumnIds(baseColumnIds, pendingColumnOrder)
        : savedColumnIds,
    [baseColumnIds, pendingColumnOrder, savedColumnIds]
  )
  const selectionProperties = useMemo(
    () =>
      renderedColumnIds.flatMap((columnId) => {
        const property = propertiesById.get(columnId)

        return property ? [property] : []
      }),
    [propertiesById, renderedColumnIds]
  )
  const headerColumnIds = useMemo(
    () =>
      dragColumnOrder
        ? getMergedColumnIds(renderedColumnIds, dragColumnOrder)
        : renderedColumnIds,
    [dragColumnOrder, renderedColumnIds]
  )
  useEffect(() => {
    if (
      pendingColumnOrder &&
      areColumnOrdersEqual(pendingColumnOrder, savedColumnIds)
    ) {
      setPendingColumnOrder(null)
    }
  }, [pendingColumnOrder, savedColumnIds])
  useEffect(() => {
    if (!pendingPropertyInsertOrder) {
      return
    }

    const existingPropertyIds = new Set(
      pendingPropertyInsertOrder.existingPropertyIds
    )
    const insertedProperty = renderedProperties.find(
      (property) => !existingPropertyIds.has(property.id)
    )

    if (!insertedProperty) {
      return
    }

    const nextColumnIds = getColumnIdsWithInsertedProperty(
      pendingPropertyInsertOrder,
      insertedProperty.id,
      renderedColumnIds
    )

    setPendingPropertyInsertOrder(null)
    setPendingColumnOrder(nextColumnIds)
    saveDatabasePropertyOrder(nextColumnIds)
  }, [
    pendingPropertyInsertOrder,
    renderedColumnIds,
    renderedProperties,
    saveDatabasePropertyOrder,
  ])
  const activeInsertProperty = pendingInsertProperty
  const canReorderColumns = editable && renderedColumnIds.length > 1
  const pendingInsertPropertyKey = activeInsertProperty
    ? getInsertPropertyColumnKey(
        activeInsertProperty.sourceColumnKey,
        activeInsertProperty.side
      )
    : null
  const columnKeys = useMemo(
    () =>
      getTableColumnKeys({
        canEditStructure,
        columnIds: renderedColumnIds,
        pendingInsert: activeInsertProperty,
      }),
    [activeInsertProperty, canEditStructure, renderedColumnIds]
  )
  const {
    columnWidths,
    startColumnResize,
    tableMinWidth,
  } = useResizableTableColumns({
    columnKeys,
    getDefaultWidth: (columnKey) => getColumnWidth({}, columnKey),
    minWidth: databaseColumnMinWidth,
    tableWrapRef,
  })
  const getInlineTableContentWidth = useCallback(
    () => tableMinWidth,
    [tableMinWidth]
  )
  useEffect(() => {
    if (
      activeEditingPropertyKey &&
      activeEditingPropertyKey !== "name" &&
      !renderedProperties.some(
        (property) => property.id === activeEditingPropertyKey
      )
    ) {
      setEditingPropertyKey(null)
    }
  }, [activeEditingPropertyKey, renderedProperties])
  useEffect(() => {
    if (!pendingFormulaSetup) {
      return
    }

    const existingPropertyIds = new Set(pendingFormulaSetup.existingPropertyIds)
    const formulaProperty = properties.find(
      (property) =>
        !existingPropertyIds.has(property.id) &&
        property.property.type === "formula"
    )

    if (!formulaProperty) {
      return
    }

    setFormulaSetupPropertyId(formulaProperty.id)
    setPendingFormulaSetup(null)
  }, [pendingFormulaSetup, properties])
  useEffect(() => {
    if (
      pendingInsertProperty &&
      pendingInsertProperty.sourceColumnKey !== "name" &&
      !renderedProperties.some(
        (property) => property.id === pendingInsertProperty.sourceColumnKey
      )
    ) {
      setPendingInsertProperty(null)
    }
  }, [pendingInsertProperty, renderedProperties])
  const handleEditingPropertyOpenChange = (
    headerScope: string,
    propertyKey: string,
    nextOpen: boolean
  ) => {
    const scopedPropertyKey = getHeaderEditingKey(headerScope, propertyKey)

    setEditingPropertyKey((currentKey: string | null) =>
      nextOpen
        ? scopedPropertyKey
        : currentKey === scopedPropertyKey
          ? null
          : currentKey
    )
  }
  const openInsertPropertyMenu = (
    sourceColumnKey: string,
    sourcePosition: number,
    side: "left" | "right"
  ) => {
    setPendingInsertProperty({
      position: sourcePosition + (side === "right" ? 1 : 0),
      side,
      sourceColumnKey,
    })
  }
  const clearPendingInsertProperty = (insertKey: string) => {
    setPendingInsertProperty((current) => {
      const currentKey = current
        ? getInsertPropertyColumnKey(current.sourceColumnKey, current.side)
        : null

      return currentKey === insertKey ? null : current
    })
  }
  const addDatabasePropertyAndMaybeOpenFormula = (
    type = "text",
    label = "Property",
    position?: number
  ) => {
    if (type === "formula") {
      setPendingFormulaSetup({
        existingPropertyIds: properties.map((property) => property.id),
      })
    }

    addDatabaseProperty(type, label, position)
  }
  const addInsertedDatabaseProperty = (
    type: string,
    label: string,
    position: number,
    insertKey: string
  ) => {
    if (pendingInsertProperty) {
      setPendingPropertyInsertOrder({
        columnIds: headerColumnIds,
        existingPropertyIds: renderedProperties.map((property) => property.id),
        side: pendingInsertProperty.side,
        sourceColumnKey: pendingInsertProperty.sourceColumnKey,
      })
    }

    addDatabasePropertyAndMaybeOpenFormula(type, label, position)
    clearPendingInsertProperty(insertKey)
  }
  const startColumnHeaderReorder = (columnId: string) => {
    if (!canReorderColumns) {
      return
    }

    setEditingPropertyKey(null)
    suppressPropertyHeaderClickRef.current = true
    setDraggedColumnId(columnId)
    dragColumnOrderRef.current = headerColumnIds
  }
  const queueColumnHeaderOrder = (columnIds: string[]) => {
    if (!canReorderColumns) {
      return
    }

    if (areColumnOrdersEqual(dragColumnOrder, columnIds)) {
      return
    }

    dragColumnOrderRef.current = columnIds
    setDragColumnOrder(columnIds)
  }
  const finishColumnHeaderReorder = () => {
    const columnIds = dragColumnOrderRef.current

    if (columnIds && !areColumnOrdersEqual(columnIds, renderedColumnIds)) {
      setPendingColumnOrder(columnIds)
      saveDatabasePropertyOrder(columnIds)
    }

    dragColumnOrderRef.current = null
    setDraggedColumnId(null)
    setDragColumnOrder(null)
    window.setTimeout(() => {
      suppressPropertyHeaderClickRef.current = false
    }, 0)
  }
  return {
    columnWidths,
    pendingInsertProperty,
    formulaSetupPropertyId,
    setFormulaSetupPropertyId,
    draggedColumnId,
    suppressPropertyHeaderClickRef,
    editingPropertyKey,
    propertiesById,
    renderedColumnIds,
    selectionProperties,
    headerColumnIds,
    canReorderColumns,
    pendingInsertPropertyKey,
    columnKeys,
    tableMinWidth,
    getInlineTableContentWidth,
    startColumnResize,
    handleEditingPropertyOpenChange,
    openInsertPropertyMenu,
    clearPendingInsertProperty,
    addDatabasePropertyAndMaybeOpenFormula,
    addInsertedDatabaseProperty,
    startColumnHeaderReorder,
    queueColumnHeaderOrder,
    finishColumnHeaderReorder,
  }
}
